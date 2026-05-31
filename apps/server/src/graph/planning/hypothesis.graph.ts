import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { hypothesisPlanningTool } from '../../tools/planning/hypothesis.tool.js';
import type {
    HypothesisCaseType,
    HypothesisGraphCall,
    HypothesisGraphInput,
    HypothesisGraphInputHints,
    HypothesisGraphName,
    HypothesisGraphOutput,
    HypothesisIdentifier,
    HypothesisKnownFact,
    HypothesisNormalizedInput,
    HypothesisPlan,
} from './hypothesis.type.js';
import {
    HypothesisGraphInputHintsSchema,
    HypothesisGraphInputSchema,
    HypothesisGraphOutputSchema,
    HypothesisPlanSchema,
} from './hypothesis.type.js';

export {
    HypothesisCaseTypeSchema,
    HypothesisConfidenceSchema,
    HypothesisGraphCallSchema,
    HypothesisGraphInputHintsSchema,
    HypothesisGraphInputSchema,
    HypothesisGraphNameSchema,
    HypothesisGraphOutputSchema,
    HypothesisIdentifierSchema,
    HypothesisKnownFactSchema,
    HypothesisNormalizedInputSchema,
    HypothesisPlanSchema,
    HypothesisPrioritySchema,
    HypothesisSchema,
    HypothesisToolInputSchema,
} from './hypothesis.type.js';
export type {
    Hypothesis,
    HypothesisCaseType,
    HypothesisConfidence,
    HypothesisGraphCall,
    HypothesisGraphInputHints,
    HypothesisGraphInput,
    HypothesisGraphName,
    HypothesisGraphOutput,
    HypothesisIdentifier,
    HypothesisKnownFact,
    HypothesisNormalizedInput,
    HypothesisPlan,
    HypothesisPriority,
    HypothesisToolInput,
} from './hypothesis.type.js';

const DEFAULT_GRAPHS: HypothesisGraphName[] = [
    'browserDiagnoseGraph',
    'codeGraph',
    'databaseGraph',
];

const HypothesisState = Annotation.Root({
    input: Annotation<HypothesisGraphInput>(),
    normalized: Annotation<HypothesisNormalizedInput | undefined>(),
    caseType: Annotation<HypothesisCaseType | undefined>(),
    knownFacts: Annotation<HypothesisKnownFact[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    candidateGraphCalls: Annotation<HypothesisGraphCall[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    missingContext: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    plan: Annotation<HypothesisPlan | undefined>(),
    errors: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    output: Annotation<HypothesisGraphOutput | undefined>(),
});

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function normalizeForMatch(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
}

function firstUrl(text: string): string | undefined {
    const match = text.match(/https?:\/\/[^\s)"']+/i);
    return match?.[0];
}

function domainFromText(text: string): string | undefined {
    const match = text.match(/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\.[a-z]{2,}/i);
    return match?.[0]?.toLowerCase();
}

function normalizeUrl(value: string | undefined): string | undefined {
    const raw = value?.trim();
    if (!raw) return undefined;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
        return new URL(withProtocol).href;
    } catch {
        return undefined;
    }
}

function domainFromUrl(value: string | undefined): string | undefined {
    if (!value) return undefined;

    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return undefined;
    }
}

function extractIdentifiers(input: {
    issue: string;
    storeUrl?: string;
    storeDomain?: string;
}): HypothesisIdentifier[] {
    const identifiers: HypothesisIdentifier[] = [];
    const issueUrl = firstUrl(input.issue);
    const url = input.storeUrl ?? normalizeUrl(issueUrl);
    const domain = input.storeDomain ?? domainFromUrl(url) ?? domainFromText(input.issue);

    if (url) identifiers.push({ kind: 'url', value: url });
    if (domain) identifiers.push({ kind: 'store_domain', value: domain });

    const idPatterns: Array<[HypothesisIdentifier['kind'], RegExp]> = [
        ['order_id', /\border(?:\s+id)?[:#\s-]*([a-z0-9_-]{4,})/i],
        ['customer_id', /\bcustomer(?:\s+id)?[:#\s-]*([a-z0-9_-]{4,})/i],
        ['product_id', /\bproduct(?:\s+id)?[:#\s-]*([a-z0-9_-]{4,})/i],
    ];

    for (const [kind, pattern] of idPatterns) {
        const value = input.issue.match(pattern)?.[1];
        if (value) identifiers.push({ kind, value });
    }

    const seen = new Set<string>();
    return identifiers.filter((item) => {
        const key = `${item.kind}:${item.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function normalizeHypothesisInput(input: HypothesisGraphInput): HypothesisNormalizedInput {
    const issue = (input.issue ?? input.question ?? '').trim();
    if (!issue) throw new Error('Hypothesis issue is required.');

    const issueUrl = normalizeUrl(firstUrl(issue));
    const explicitUrl = normalizeUrl(input.storeUrl);
    const explicitDomain = input.storeDomain?.trim().toLowerCase();
    const detectedDomain = explicitDomain ?? domainFromUrl(explicitUrl ?? issueUrl) ?? domainFromText(issue);
    const storeUrl = explicitUrl ?? issueUrl ?? normalizeUrl(detectedDomain);
    const identifiers = extractIdentifiers({
        issue,
        ...(storeUrl ? { storeUrl } : {}),
        ...(detectedDomain ? { storeDomain: detectedDomain } : {}),
    });

    const normalized: HypothesisNormalizedInput = {
        app: input.app.trim(),
        issue,
        identifiers,
    };
    if (storeUrl) normalized.storeUrl = storeUrl;
    if (detectedDomain) normalized.storeDomain = detectedDomain;

    return normalized;
}

export function classifyHypothesisCase(issue: string): HypothesisCaseType {
    const text = normalizeForMatch(issue);
    const checks: Array<[HypothesisCaseType, RegExp]> = [
        ['auth_session', /\b(auth|oauth|session|login|token|cookie|redirect loop|dang nhap|het han)\b/],
        ['billing_access', /\b(billing|subscription|charge|plan|payment|trial|invoice|thanh toan)\b/],
        [
            'api_permission',
            /\b(scope|permission|access denied|unauthorized|forbidden|401|403|admin api|graphql|rest api)\b/,
        ],
        ['webhook_sync', /\b(webhook|topic|delivery|retry|sync|reconcile|event)\b/],
        ['script_loading', /\b(script|asset|cdn|network|load|404|blocked|console|inject|injection|khong load)\b/],
        ['data_missing', /\b(no data|missing data|empty|record|count|not found|data|du lieu|khong co du lieu)\b/],
        ['embedded_admin_ui', /\b(admin|embedded|iframe|app bridge|blank page|navigation|admin ui|dashboard|trang trang)\b/],
        ['installation_activation', /\b(install|uninstall|activate|activation|enable|disable|setup|cai dat|kich hoat)\b/],
        ['performance', /\b(slow|timeout|latency|performance|lag|load time|cham|qua lau)\b/],
        ['storefront_runtime', /\b(storefront|theme|page|display|render|visible|not show|missing|khong hien|khong thay)\b/],
        ['configuration', /\b(config|setting|preference|option|rule|setup|cau hinh)\b/],
    ];

    return checks.find(([, pattern]) => pattern.test(text))?.[0] ?? 'unknown';
}

function graphCall(input: {
    graph: HypothesisGraphName;
    priority: HypothesisGraphCall['priority'];
    reason: string;
    inputHints: Partial<HypothesisGraphInputHints>;
    expectedSignals: string[];
}): HypothesisGraphCall {
    return {
        graph: input.graph,
        priority: input.priority,
        reason: input.reason,
        inputHints: HypothesisGraphInputHintsSchema.parse(input.inputHints),
        expectedSignals: input.expectedSignals,
    };
}

function hasGraph(input: HypothesisGraphInput, graph: HypothesisGraphName): boolean {
    return (input.availableGraphs ?? DEFAULT_GRAPHS).includes(graph);
}

export function buildCandidateGraphCalls(
    input: HypothesisGraphInput,
    normalized: HypothesisNormalizedInput,
    caseType: HypothesisCaseType,
): {
    calls: HypothesisGraphCall[];
    missingContext: string[];
} {
    const missingContext: string[] = [];
    const calls: HypothesisGraphCall[] = [];
    const storeTarget = normalized.storeUrl ?? normalized.storeDomain;

    if (!storeTarget) {
        missingContext.push('storeUrl or storeDomain for browser/runtime verification');
    }

    if (hasGraph(input, 'browserDiagnoseGraph')) {
        calls.push(
            graphCall({
                graph: 'browserDiagnoseGraph',
                priority:
                    caseType === 'storefront_runtime' ||
                    caseType === 'script_loading' ||
                    caseType === 'embedded_admin_ui' ||
                    caseType === 'performance'
                        ? 'high'
                        : 'medium',
                reason: 'Verify runtime presence, browser errors, network failures, and surface-specific behavior.',
                inputHints: {
                    app: normalized.app,
                    url: storeTarget ?? 'missing store URL/domain',
                },
                expectedSignals: [
                    'app-related DOM or script signal',
                    'network request failures',
                    'console errors or redirects',
                ],
            }),
        );
    }

    if (hasGraph(input, 'codeGraph')) {
        calls.push(
            graphCall({
                graph: 'codeGraph',
                priority: caseType === 'unknown' ? 'medium' : 'high',
                reason: 'Find the implementation owner, gates, configuration, and behavior-specific code paths.',
                inputHints: {
                    app: normalized.app,
                    issue: normalized.issue,
                    mode: 'search',
                },
                expectedSignals: [
                    'owning files or modules',
                    'feature gates and config paths',
                    'relevant API/webhook/runtime logic',
                ],
            }),
        );
    }

    if (hasGraph(input, 'databaseGraph')) {
        calls.push(
            graphCall({
                graph: 'databaseGraph',
                priority:
                    caseType === 'data_missing' ||
                    caseType === 'webhook_sync' ||
                    caseType === 'billing_access' ||
                    caseType === 'auth_session' ||
                    caseType === 'installation_activation'
                        ? 'high'
                        : 'medium',
                reason: 'Check read-only store state, settings, sync status, subscription/session data, and recent records.',
                inputHints: {
                    app: normalized.app,
                    issue: normalized.issue,
                    storeDomain: normalized.storeDomain ?? 'missing store domain',
                },
                expectedSignals: [
                    'store installation/settings state',
                    'recent records or sync markers',
                    'missing or stale backend state',
                ],
            }),
        );
    }

    if (caseType === 'data_missing' && !normalized.storeDomain) {
        missingContext.push('storeDomain for focused database checks');
    }

    return { calls, missingContext };
}

function knownFacts(normalized: HypothesisNormalizedInput, caseType: HypothesisCaseType): HypothesisKnownFact[] {
    const facts: HypothesisKnownFact[] = [
        {
            id: 'input.app',
            content: `App: ${normalized.app}`,
        },
        {
            id: 'input.issue',
            content: `Issue: ${normalized.issue}`,
        },
        {
            id: 'classification.caseType',
            content: `Pre-diagnosis case type: ${caseType}`,
        },
    ];

    if (normalized.storeUrl) {
        facts.push({ id: 'input.storeUrl', content: `Store URL: ${normalized.storeUrl}` });
    }

    if (normalized.storeDomain) {
        facts.push({
            id: 'input.storeDomain',
            content: `Store domain: ${normalized.storeDomain}`,
        });
    }

    return facts;
}

async function normalizeNode(state: typeof HypothesisState.State) {
    const normalized = normalizeHypothesisInput(state.input);
    return { normalized };
}

async function classifyNode(state: typeof HypothesisState.State) {
    if (!state.normalized) return { errors: ['hypothesis.classify skipped: missing normalized input.'] };

    const caseType = classifyHypothesisCase(state.normalized.issue);
    return {
        caseType,
        knownFacts: knownFacts(state.normalized, caseType),
    };
}

async function graphCandidatesNode(state: typeof HypothesisState.State) {
    if (!state.normalized || !state.caseType) {
        return { errors: ['hypothesis.graph_candidates skipped: missing normalized input or case type.'] };
    }

    const result = buildCandidateGraphCalls(state.input, state.normalized, state.caseType);
    return {
        candidateGraphCalls: result.calls,
        missingContext: result.missingContext,
    };
}

async function generateNode(state: typeof HypothesisState.State) {
    if (!state.normalized || !state.caseType) {
        return { errors: ['hypothesis.generate skipped: missing normalized input or case type.'] };
    }

    try {
        const plan = (await hypothesisPlanningTool.invoke({
            app: state.normalized.app,
            issue: state.normalized.issue,
            storeUrl: state.normalized.storeUrl,
            storeDomain: state.normalized.storeDomain,
            identifiers: state.normalized.identifiers,
            caseType: state.caseType,
            knownFacts: state.knownFacts,
            candidateGraphCalls: state.candidateGraphCalls,
            missingContext: state.missingContext,
            maxHypotheses: state.input.maxHypotheses ?? 4,
        })) as HypothesisPlan;

        return { plan };
    } catch (error) {
        return { errors: [`hypothesis.generate failed: ${errorMessage(error)}`] };
    }
}

function fallbackPlan(state: typeof HypothesisState.State): HypothesisPlan {
    const normalized = state.normalized ?? {
        app: state.input.app,
        issue: state.input.issue ?? state.input.question ?? 'unknown issue',
        identifiers: [],
    };
    const caseType = state.caseType ?? classifyHypothesisCase(normalized.issue);
    const candidateGraphCalls = state.candidateGraphCalls.length
        ? state.candidateGraphCalls
        : buildCandidateGraphCalls(state.input, normalized, caseType).calls;

    return HypothesisPlanSchema.parse({
        summary: `Generated fallback hypotheses for "${normalized.issue}".`,
        caseType,
        hypotheses: [
            {
                id: 'h1-collect-diagnosis-context',
                rank: 1,
                title: 'Diagnosis context is incomplete',
                statement:
                    'The issue cannot be narrowed safely until at least one runtime, code, or read-only data graph is executed.',
                whyPlausible: 'Only the issue text is guaranteed at this stage.',
                verificationGoal: 'Run the highest-priority graph and use its output to confirm or reject follow-up hypotheses.',
                recommendedGraphs: candidateGraphCalls.slice(0, 1),
                confirmSignals: ['A graph returns concrete runtime, code, or data evidence.'],
                rejectSignals: ['No existing graph can be called with the available context.'],
                confidence: 'low',
            },
        ],
        nextGraphCalls: candidateGraphCalls.slice(0, 1),
        missingContext: state.missingContext,
        assumptions: ['Fallback output is not a confirmed root cause.'],
    });
}

function finalizeNode(state: typeof HypothesisState.State) {
    const normalized =
        state.normalized ??
        ({
            app: state.input.app,
            issue: state.input.issue ?? state.input.question ?? 'unknown issue',
            identifiers: [],
        } satisfies HypothesisNormalizedInput);
    const caseType = state.caseType ?? classifyHypothesisCase(normalized.issue);
    const plan = state.plan ?? fallbackPlan(state);
    const output: HypothesisGraphOutput = {
        app: normalized.app,
        issue: normalized.issue,
        identifiers: normalized.identifiers,
        caseType,
        knownFacts: state.knownFacts,
        plan,
        summary: plan.summary,
        errors: state.errors,
    };
    if (normalized.storeUrl) output.storeUrl = normalized.storeUrl;
    if (normalized.storeDomain) output.storeDomain = normalized.storeDomain;

    return { output: HypothesisGraphOutputSchema.parse(output) };
}

const workflow = new StateGraph(HypothesisState)
    .addNode('normalize_issue', normalizeNode)
    .addNode('classify_case', classifyNode)
    .addNode('build_graph_candidates', graphCandidatesNode)
    .addNode('generate_hypotheses', generateNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'normalize_issue')
    .addEdge('normalize_issue', 'classify_case')
    .addEdge('classify_case', 'build_graph_candidates')
    .addEdge('build_graph_candidates', 'generate_hypotheses')
    .addEdge('generate_hypotheses', 'finalize')
    .addEdge('finalize', END);

export const hypothesisGraph = workflow.compile();

export async function invokeHypothesisGraph(
    input: HypothesisGraphInput,
): Promise<HypothesisGraphOutput> {
    const parsed = HypothesisGraphInputSchema.parse(input);
    const result = await hypothesisGraph.invoke({ input: parsed });

    if (!result.output) {
        throw new Error('Hypothesis graph returned no output');
    }

    return result.output;
}
