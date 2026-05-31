import { invokeBrowserDiagnoseGraph } from './browser/diagnose.graph.js';
import { invokeCodeGraphStep } from './code/code.graph.js';
import type { CodeRepoReference } from './code/code.type.js';
import { invokeDatabaseGraph } from './database/database.graph.js';
import type { AppDatabaseConfig } from './database/database.type.js';
import type { HypothesisGraphCall } from './planning/hypothesis.type.js';
import type {
    ParsedSupportGraphInput,
    SupportGraphStep,
    SupportStepStatus,
} from './support/support.type.js';

type GraphRuntimeContext = Pick<
    ParsedSupportGraphInput,
    | 'app'
    | 'issue'
    | 'storeUrl'
    | 'storeDomain'
    | 'threadId'
    | 'mode'
    | 'repos'
    | 'repoName'
    | 'repoNames'
    | 'dbSources'
>;

type JsonMap = Record<string, unknown>;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function nowIso(): string {
    return new Date().toISOString();
}

function isMissingHint(value: string | null | undefined): boolean {
    return !value || value.toLowerCase().startsWith('missing ');
}

function normalizeUrlTarget(value: string | null | undefined): string | undefined {
    if (isMissingHint(value)) return undefined;
    const raw = value?.trim();
    if (!raw) return undefined;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
        return new URL(withProtocol).href;
    } catch {
        return undefined;
    }
}

function outputSummary(output: unknown): string | undefined {
    if (output && typeof output === 'object' && 'summary' in output) {
        const summary = (output as { summary?: unknown }).summary;
        return typeof summary === 'string' ? summary : undefined;
    }

    return undefined;
}

function graphStep(input: {
    graph: SupportGraphStep['graph'];
    status: SupportStepStatus;
    reason?: string;
    input?: JsonMap;
    output?: unknown;
    error?: string;
    startedAt: string;
    metadata?: JsonMap;
}): SupportGraphStep {
    const finishedAt = nowIso();
    return {
        stepKey: `${input.graph}:${input.startedAt}`,
        graph: input.graph,
        status: input.status,
        input: input.input ?? {},
        startedAt: input.startedAt,
        finishedAt,
        metadata: input.metadata ?? {},
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.output !== undefined ? { output: input.output } : {}),
        ...(input.error ? { error: input.error } : {}),
    };
}

function safeDbSourceSummary(sources: AppDatabaseConfig | undefined): JsonMap {
    if (!sources) return { sourceCount: 0, sources: [] };
    return {
        sourceCount: Object.keys(sources).length,
        sources: Object.entries(sources).map(([key, config]) => ({
            key,
            type: config.type,
        })),
    };
}

function safeRepoSummary(repos: CodeRepoReference[]): JsonMap {
    return {
        repoCount: repos.length,
        repos: repos.map((repo) => ({
            name: repo.name,
            url: repo.url,
            branch: repo.branch,
        })),
    };
}

async function executeBrowserGraph(
    call: HypothesisGraphCall,
    context: GraphRuntimeContext,
    startedAt: string,
): Promise<SupportGraphStep> {
    const url =
        normalizeUrlTarget(call.inputHints.url) ??
        normalizeUrlTarget(context.storeUrl) ??
        normalizeUrlTarget(context.storeDomain);

    const input = {
        app: context.app,
        url: url ?? null,
    };

    if (!url) {
        return graphStep({
            graph: 'browserDiagnoseGraph',
            status: 'skipped',
            reason: 'Missing store URL/domain for browser diagnosis.',
            input,
            startedAt,
        });
    }

    const output = await invokeBrowserDiagnoseGraph({
        app: context.app,
        url,
    });

    return graphStep({
        graph: 'browserDiagnoseGraph',
        status: 'completed',
        reason: call.reason,
        input,
        output,
        startedAt,
    });
}

async function executeCodeGraph(
    call: HypothesisGraphCall,
    context: GraphRuntimeContext,
    startedAt: string,
): Promise<SupportGraphStep> {
    const repos = context.repos ?? [];
    const repoNames = context.repoNames ?? [];
    const hasRepoContext = repos.length > 0 || Boolean(context.repoName) || repoNames.length > 0;
    const mode = context.mode === 'fix' ? 'fix' : 'search';
    const input = {
        app: context.app,
        issue: context.issue,
        mode,
        threadId: context.threadId ? `${context.threadId}:code` : undefined,
        repoName: context.repoName,
        repoNames,
        ...safeRepoSummary(repos),
    };

    if (!hasRepoContext) {
        return graphStep({
            graph: 'codeGraph',
            status: 'skipped',
            reason: 'Missing repo config or repo name hint for code diagnosis.',
            input,
            startedAt,
        });
    }

    const result = await invokeCodeGraphStep({
        app: context.app,
        issue: context.issue,
        mode,
        ...(repos.length ? { repos } : {}),
        ...(context.repoName ? { repoName: context.repoName } : {}),
        ...(repoNames.length ? { repoNames } : {}),
        ...(context.threadId ? { threadId: `${context.threadId}:code` } : {}),
    });

    if (result.status === 'interrupted') {
        return graphStep({
            graph: 'codeGraph',
            status: 'interrupted',
            reason: call.reason,
            input,
            output: {
                threadId: result.threadId,
                interrupts: result.interrupts,
            },
            startedAt,
        });
    }

    return graphStep({
        graph: 'codeGraph',
        status: 'completed',
        reason: call.reason,
        input,
        output: result.output,
        startedAt,
    });
}

async function executeDatabaseGraph(
    call: HypothesisGraphCall,
    context: GraphRuntimeContext,
    startedAt: string,
): Promise<SupportGraphStep> {
    const input = {
        app: context.app,
        issue: context.issue,
        ...safeDbSourceSummary(context.dbSources),
    };

    if (!context.dbSources || Object.keys(context.dbSources).length === 0) {
        return graphStep({
            graph: 'databaseGraph',
            status: 'skipped',
            reason: 'Missing configured read-only database sources.',
            input,
            startedAt,
        });
    }

    const output = await invokeDatabaseGraph({
        app: context.app,
        issue: context.issue,
        sources: context.dbSources,
        maxChecks: 5,
        sampleLimit: 5,
    });

    return graphStep({
        graph: 'databaseGraph',
        status: 'completed',
        reason: call.reason,
        input,
        output,
        startedAt,
    });
}

export async function executeGraphCall(
    call: HypothesisGraphCall,
    context: GraphRuntimeContext,
): Promise<SupportGraphStep> {
    const startedAt = nowIso();

    try {
        if (call.graph === 'browserDiagnoseGraph') {
            return await executeBrowserGraph(call, context, startedAt);
        }

        if (call.graph === 'codeGraph') {
            return await executeCodeGraph(call, context, startedAt);
        }

        return await executeDatabaseGraph(call, context, startedAt);
    } catch (error) {
        return graphStep({
            graph: call.graph,
            status: 'failed',
            reason: call.reason,
            input: {
                app: context.app,
                issue: context.issue,
            },
            error: errorMessage(error),
            startedAt,
        });
    }
}

export function stepSummary(step: SupportGraphStep): string | undefined {
    return outputSummary(step.output) ?? step.reason ?? step.error;
}
