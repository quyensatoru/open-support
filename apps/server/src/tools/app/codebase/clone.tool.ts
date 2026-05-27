import { tool } from '@langchain/core/tools';
import { Gitlab } from '@gitbeaker/core';
import { interrupt } from '@langchain/langgraph';
import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';

import { env } from '../../env.js';
import { logger } from '../../observability/logger.js';
import {
    CodeCloneInputSchema,
    type CodeCloneResult,
    type CodeRepoInterrupt,
    type CodeRepoReference,
    type CodeRepoResume,
} from '../../graph/code/code.type.js';

type GitLabProject = {
    name?: string;
    path?: string;
    path_with_namespace?: string;
    pathWithNamespace?: string;
    http_url_to_repo?: string;
    httpUrlToRepo?: string;
    ssh_url_to_repo?: string;
    sshUrlToRepo?: string;
    default_branch?: string;
    defaultBranch?: string;
    namespace?: {
        name?: string;
        path?: string;
        full_path?: string;
        fullPath?: string;
    };
};

type GitLabGroup = {
    id: number;
    name?: string;
    path?: string;
    full_path?: string;
    fullPath?: string;
};

type GitlabServiceOptions = {
    url: string;
    headers?: Record<string, string>;
    authHeaders?: Record<string, () => Promise<string>>;
};

type GitlabRequestOptions = {
    body?: unknown;
    searchParams?: Record<string, unknown>;
    sudo?: string | number;
    method?: string;
    asStream?: boolean;
    signal?: AbortSignal;
};

function ensureProtocol(host: string) {
    if (/^https?:\/\//i.test(host)) return host;
    return `https://${host}`;
}

function getWorkspacePath(workspace?: string) {
    const configured = workspace || env.WORKSPACE || 'workspace';
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function sanitizeSegment(value: string) {
    return value
        .trim()
        .replace(/\.git$/i, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function repoNameFromUrl(url: string) {
    const clean = url.split('?')[0] ?? url;
    const last = clean.split('/').filter(Boolean).at(-1) ?? 'repo';
    return sanitizeSegment(last) || 'repo';
}

function safeCloneUrl(url: string) {
    try {
        const parsed = new URL(url);
        parsed.username = '';
        parsed.password = '';
        return parsed.toString();
    } catch {
        return url;
    }
}

function authenticatedCloneUrl(url: string) {
    if (!env.GITLAB_TOKEN || !/^https?:\/\//i.test(url)) return url;

    try {
        const parsed = new URL(url);
        parsed.username = env.GITLAB_USERNAME || 'oauth2';
        parsed.password = env.GITLAB_TOKEN;
        return parsed.toString();
    } catch {
        return url;
    }
}

function normalizeTerms(value: string) {
    return value
        .split(/[,\n]+/)
        .map((term) => term.trim())
        .filter(Boolean);
}

function normalizeRepoNames(resume: CodeRepoResume | string[] | string | unknown) {
    if (typeof resume === 'string') return normalizeTerms(resume);
    if (Array.isArray(resume))
        return resume.filter((item): item is string => typeof item === 'string');
    if (!resume || typeof resume !== 'object') return [];

    const data = resume as CodeRepoResume;
    return [...(data.repoName ? [data.repoName] : []), ...(data.repoNames ?? [])];
}

function snakeCase(value: string) {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function decamelize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decamelize);
    if (!value || typeof value !== 'object' || value instanceof FormData) return value;

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [snakeCase(key), decamelize(item)]),
    );
}

function appendSearchParams(url: URL, searchParams?: Record<string, unknown>) {
    if (!searchParams) return;

    const params = decamelize(searchParams) as Record<string, unknown>;
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            value.forEach((item) => url.searchParams.append(key, String(item)));
        } else {
            url.searchParams.set(key, String(value));
        }
    }
}

function createRequesterFn() {
    const request = async (
        serviceOptions: GitlabServiceOptions,
        endpoint: string,
        options: GitlabRequestOptions = {},
    ) => {
        const url = new URL(
            endpoint.replace(/^\/+/, ''),
            `${serviceOptions.url.replace(/\/+$/, '')}/`,
        );
        appendSearchParams(url, options.searchParams);

        const headers: Record<string, string> = {
            ...(serviceOptions.headers ?? {}),
        };

        if (options.sudo) {
            headers.Sudo = String(options.sudo);
        }

        const authHeader = Object.entries(serviceOptions.authHeaders ?? {})[0];
        if (authHeader) {
            const [key, value] = authHeader;
            headers[key] = await value();
        }

        let body: BodyInit | undefined;
        if (options.body instanceof FormData) {
            body = options.body;
        } else if (options.body) {
            headers['content-type'] = 'application/json';
            body = JSON.stringify(decamelize(options.body));
        }

        const requestInit: RequestInit = {
            method: options.method ?? 'GET',
            headers,
        };

        if (body) requestInit.body = body;
        if (options.signal) requestInit.signal = options.signal;

        const response = await fetch(url, requestInit);

        const responseHeaders = Object.fromEntries(response.headers.entries());
        const contentType = response.headers.get('content-type') ?? '';
        const responseBody = options.asStream
            ? response.body
            : contentType.includes('application/json')
              ? await response.json()
              : await response.text();

        if (!response.ok) {
            throw new Error(
                `GitLab request failed: ${response.status} ${response.statusText} ${String(responseBody).slice(0, 500)}`,
            );
        }

        return {
            body: responseBody,
            headers: responseHeaders,
            status: response.status,
        };
    };

    return (serviceOptions: GitlabServiceOptions) => ({
        get: (endpoint: string, options?: GitlabRequestOptions) =>
            request(serviceOptions, endpoint, { ...options, method: 'GET' }),
        post: (endpoint: string, options?: GitlabRequestOptions) =>
            request(serviceOptions, endpoint, { ...options, method: 'POST' }),
        put: (endpoint: string, options?: GitlabRequestOptions) =>
            request(serviceOptions, endpoint, { ...options, method: 'PUT' }),
        patch: (endpoint: string, options?: GitlabRequestOptions) =>
            request(serviceOptions, endpoint, { ...options, method: 'PATCH' }),
        delete: (endpoint: string, options?: GitlabRequestOptions) =>
            request(serviceOptions, endpoint, { ...options, method: 'DELETE' }),
    });
}

function gitlabClient() {
    if (!env.GITLAB_HOST) {
        throw new Error('GITLAB_HOST is required to search repositories.');
    }

    return new Gitlab({
        host: ensureProtocol(env.GITLAB_HOST),
        token: env.GITLAB_TOKEN || undefined,
        requesterFn: createRequesterFn(),
    } as ConstructorParameters<typeof Gitlab>[0]);
}

function projectToRepo(project: GitLabProject): CodeRepoReference | null {
    const url =
        project.http_url_to_repo ||
        project.httpUrlToRepo ||
        project.ssh_url_to_repo ||
        project.sshUrlToRepo;

    if (!url) return null;

    return {
        name: project.path || project.name || repoNameFromUrl(url),
        url,
        ...(project.default_branch || project.defaultBranch
            ? { branch: project.default_branch || project.defaultBranch }
            : {}),
    };
}

function projectHaystack(project: GitLabProject) {
    return [
        project.name,
        project.path,
        project.path_with_namespace,
        project.pathWithNamespace,
        project.namespace?.name,
        project.namespace?.path,
        project.namespace?.full_path,
        project.namespace?.fullPath,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function groupHaystack(group: GitLabGroup) {
    return [group.name, group.path, group.full_path, group.fullPath]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function uniqueRepos(repos: CodeRepoReference[]) {
    const seen = new Set<string>();
    return repos.filter((repo) => {
        if (seen.has(repo.url)) return false;
        seen.add(repo.url);
        return true;
    });
}

async function findProjectsByGroupApp(app: string): Promise<CodeRepoReference[]> {
    const gitlab = gitlabClient();
    const groups = (await gitlab.Groups.search(app)) as GitLabGroup[];
    const normalizedApp = app.toLowerCase();
    const matchedGroups = groups.filter((group) => groupHaystack(group).includes(normalizedApp));
    const repos: CodeRepoReference[] = [];

    for (const group of matchedGroups) {
        const projects = (await gitlab.Groups.allProjects(group.id, {
            includeSubgroups: true,
            simple: true,
            perPage: 100,
            maxPages: 20,
        })) as GitLabProject[];

        repos.push(
            ...projects
                .map(projectToRepo)
                .filter((repo): repo is CodeRepoReference => Boolean(repo)),
        );
    }

    return uniqueRepos(repos);
}

async function findProjectsByRepoNames(
    app: string,
    repoNames: string[],
): Promise<CodeRepoReference[]> {
    const gitlab = gitlabClient();
    const normalizedApp = app.toLowerCase();
    const repos: CodeRepoReference[] = [];

    for (const repoName of repoNames) {
        const normalizedRepoName = repoName.toLowerCase();
        const projects = (await gitlab.Projects.all({
            search: repoName,
            simple: true,
            membership: true,
            perPage: 100,
            maxPages: 10,
        })) as GitLabProject[];
        console.log('repoName: ', repoName);
        console.log('projects: ', projects);

        repos.push(
            ...projects
                .filter((project) => {
                    const haystack = projectHaystack(project);
                    return (
                        haystack.includes(normalizedRepoName) || haystack.includes(normalizedApp)
                    );
                })
                .map(projectToRepo)
                .filter((repo): repo is CodeRepoReference => Boolean(repo)),
        );
    }

    return uniqueRepos(repos);
}

export const cloneRepos = tool(
    async (input): Promise<CodeCloneResult> => {
        const parsed = CodeCloneInputSchema.parse(input);
        const workspacePath = getWorkspacePath(parsed.workspace);
        const warnings: string[] = [];

        let repoRefs = parsed.repos ?? [];
        let repoNames = [
            ...(parsed.repoName ? [parsed.repoName] : []),
            ...(parsed.repoNames ?? []),
        ];

        if (!repoRefs.length) {
            try {
                repoRefs = repoNames.length
                    ? await findProjectsByRepoNames(parsed.app, repoNames)
                    : await findProjectsByGroupApp(parsed.app);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                warnings.push(message);
                logger.warn(message);
            }
        }

        if (!repoRefs.length) {
            const resume = interrupt<CodeRepoInterrupt, CodeRepoResume | string[] | string>({
                reason: 'repo_not_found',
                app: parsed.app,
                question:
                    `Khong tim thay GitLab group/project cho app "${parsed.app}". ` +
                    'Hay nhap repo name de search, vi du "mida-record" hoac JSON { "repoName": "mida-record" }.',
                expected: {
                    repoName: 'mida-record',
                },
            });

            repoNames = normalizeRepoNames(resume);

            if (repoNames.length) {
                repoRefs = await findProjectsByRepoNames(parsed.app, repoNames);
            }
        }

        if (!repoRefs.length) {
            throw new Error(`No repositories found for app "${parsed.app}".`);
        }

        fs.mkdirSync(workspacePath, { recursive: true });

        const cloned: string[] = [];
        const pulled: string[] = [];
        const skipped: string[] = [];
        const repos: CodeCloneResult['repos'] = [];

        for (const repoRef of repoRefs) {
            const repoName = sanitizeSegment(repoRef.name ?? repoNameFromUrl(repoRef.url));
            const localPath = path.join(workspacePath, sanitizeSegment(parsed.app), repoName);
            const gitDir = path.join(localPath, '.git');

            try {
                if (fs.existsSync(gitDir)) {
                    const git = simpleGit(localPath);
                    await git.pull();
                    pulled.push(repoName);
                } else if (fs.existsSync(localPath)) {
                    skipped.push(repoName);
                    warnings.push(`Skipped ${repoName}: target path exists but is not a git repo.`);
                } else {
                    fs.mkdirSync(path.dirname(localPath), { recursive: true });
                    const git = simpleGit();
                    const cloneArgs = repoRef.branch ? ['--branch', repoRef.branch] : [];
                    await git.clone(authenticatedCloneUrl(repoRef.url), localPath, cloneArgs);
                    cloned.push(repoName);
                }

                repos.push({
                    name: repoName,
                    url: repoRef.url,
                    safeUrl: safeCloneUrl(repoRef.url),
                    localPath,
                    ...(repoRef.branch ? { branch: repoRef.branch } : {}),
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                warnings.push(`Failed ${repoName}: ${message}`);
                logger.error(message);
            }
        }

        return {
            ok: repos.length > 0,
            app: parsed.app,
            workspacePath,
            repos,
            cloned,
            pulled,
            skipped,
            warnings,
        };
    },
    {
        name: 'code_clone_repos',
        description:
            'Search GitLab by app/group or repo name, then clone or pull every matched repository into local workspace.',
        schema: CodeCloneInputSchema,
    },
);
