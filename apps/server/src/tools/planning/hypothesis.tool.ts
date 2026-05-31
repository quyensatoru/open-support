import { tool } from '@langchain/core/tools';

import {
    HypothesisGraphInputHintsSchema,
    HypothesisPlanSchema,
    HypothesisToolInputSchema,
    type Hypothesis,
    type HypothesisGraphCall,
    type HypothesisGraphInputHints,
    type HypothesisPlan,
    type HypothesisToolInput,
} from '../../graph/planning/hypothesis.type.js';
import { LlmSupportReasoning } from '../../llm/support.llm.js';
import { logger } from '../../observability/logger.js';

const PROMPT = `
You are a senior support triage agent.

Goal:
Generate concise, testable hypotheses for a reported app issue. The caller will use your
hypotheses to decide which existing graph to call next.

Rules:
- Do not execute diagnosis and do not claim a root cause is confirmed.
- Keep hypotheses generic and app-neutral. Use app name only as context.
- Prefer 3 to 5 hypotheses unless maxHypotheses is lower.
- Each hypothesis must be distinct, falsifiable, and mapped to one or more graph calls.
- Use only these graph names: browserDiagnoseGraph, codeGraph, databaseGraph.
- Confidence can only be low or medium because this is pre-diagnosis.
- Be compact: short title, one sentence statement, focused signals.
- Do not invent exact file names, database collections, API routes, or browser errors.
- If store URL/domain or other key context is missing, put it in missingContext and make graph inputHints explicit.
- Return only a valid JSON object matching the requested schema.
- Detect the primary natural language of the issue/question text and write all user-facing output in that same language.
- Apply that language to summary, hypothesis titles/statements, rationale, verification goals, signals, graph-call reasons, expectedSignals, missingContext, and assumptions.
- Preserve app names, graph names, identifiers, URLs, API/code/database terms, and product-specific nouns exactly as written.
- If the issue mixes languages, follow the language used for the main problem description. If the language is unclear, use English.
`;

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function byGraph(calls: HypothesisGraphCall[], graph: HypothesisGraphCall['graph']) {
    return calls.find((call) => call.graph === graph);
}

function graphCall(input: {
    graph: HypothesisGraphCall['graph'];
    priority?: HypothesisGraphCall['priority'];
    reason: string;
    inputHints?: Partial<HypothesisGraphInputHints>;
    expectedSignals: string[];
}): HypothesisGraphCall {
    return {
        graph: input.graph,
        priority: input.priority ?? 'medium',
        reason: input.reason,
        inputHints: HypothesisGraphInputHintsSchema.parse(input.inputHints ?? {}),
        expectedSignals: input.expectedSignals,
    };
}

function normalizePlan(raw: HypothesisPlan, input: HypothesisToolInput): HypothesisPlan {
    const allowedGraphs = new Set(input.candidateGraphCalls.map((call) => call.graph));
    const fallbackCalls = input.candidateGraphCalls;
    const hypotheses = raw.hypotheses
        .slice(0, input.maxHypotheses)
        .map((hypothesis, index) => {
            const recommendedGraphs = hypothesis.recommendedGraphs.filter((call) =>
                allowedGraphs.size ? allowedGraphs.has(call.graph) : true,
            );

            return {
                ...hypothesis,
                id: hypothesis.id || `h${index + 1}`,
                rank: index + 1,
                confidence: hypothesis.confidence === 'medium' ? 'medium' : 'low',
                recommendedGraphs: recommendedGraphs.length ? recommendedGraphs : fallbackCalls.slice(0, 1),
            } satisfies Hypothesis;
        })
        .filter((hypothesis) => hypothesis.recommendedGraphs.length);

    return HypothesisPlanSchema.parse({
        ...raw,
        caseType: input.caseType,
        hypotheses: hypotheses.length ? hypotheses : fallbackPlan(input).hypotheses,
        nextGraphCalls: dedupeGraphCalls(
            raw.nextGraphCalls.length
                ? raw.nextGraphCalls.filter((call) =>
                      allowedGraphs.size ? allowedGraphs.has(call.graph) : true,
                  )
                : hypotheses.flatMap((hypothesis) => hypothesis.recommendedGraphs),
        ),
        missingContext: unique([...raw.missingContext, ...input.missingContext]),
        assumptions: raw.assumptions,
    });
}

function dedupeGraphCalls(calls: HypothesisGraphCall[]): HypothesisGraphCall[] {
    const seen = new Set<string>();
    const result: HypothesisGraphCall[] = [];

    for (const call of calls) {
        if (seen.has(call.graph)) continue;
        seen.add(call.graph);
        result.push(call);
    }

    return result;
}

function makeHypothesis(input: {
    id: string;
    rank: number;
    title: string;
    statement: string;
    whyPlausible: string;
    verificationGoal: string;
    recommendedGraphs: HypothesisGraphCall[];
    confirmSignals: string[];
    rejectSignals: string[];
    confidence?: Hypothesis['confidence'];
}): Hypothesis {
    return {
        id: input.id,
        rank: input.rank,
        title: input.title,
        statement: input.statement,
        whyPlausible: input.whyPlausible,
        verificationGoal: input.verificationGoal,
        recommendedGraphs: input.recommendedGraphs,
        confirmSignals: input.confirmSignals,
        rejectSignals: input.rejectSignals,
        confidence: input.confidence ?? 'low',
    };
}

function fallbackPlan(input: HypothesisToolInput): HypothesisPlan {
    const browserCall =
        byGraph(input.candidateGraphCalls, 'browserDiagnoseGraph') ??
        graphCall({
            graph: 'browserDiagnoseGraph',
            reason: 'Check browser/runtime signals for the affected store or admin surface.',
            inputHints: {
                app: input.app,
                url: input.storeUrl ?? input.storeDomain ?? 'missing store URL/domain',
            },
            expectedSignals: ['DOM/script presence', 'network failures', 'console errors'],
        });
    const codeCall =
        byGraph(input.candidateGraphCalls, 'codeGraph') ??
        graphCall({
            graph: 'codeGraph',
            reason: 'Find the implementation owner for the reported behavior.',
            inputHints: { app: input.app, issue: input.issue, mode: 'search' },
            expectedSignals: ['owning files', 'feature gates', 'configuration paths'],
        });
    const databaseCall =
        byGraph(input.candidateGraphCalls, 'databaseGraph') ??
        graphCall({
            graph: 'databaseGraph',
            reason: 'Check read-only state related to the store and reported issue.',
            inputHints: { app: input.app, issue: input.issue },
            expectedSignals: ['installation/settings records', 'recent relevant data', 'sync state'],
        });

    const hypotheses: Hypothesis[] = [
        makeHypothesis({
            id: 'h1-runtime-or-surface',
            rank: 1,
            title: 'Runtime or Shopify surface mismatch',
            statement:
                'The issue may happen because the app is not present, not loading, or failing on the affected Shopify surface.',
            whyPlausible:
                'User-facing symptoms often need browser/admin runtime confirmation before code or data checks are meaningful.',
            verificationGoal: 'Confirm whether the app runtime appears and whether browser errors explain the symptom.',
            recommendedGraphs: [browserCall, codeCall],
            confirmSignals: [
                'App-related DOM/script/network signal is missing or failing.',
                'Console or network output shows an error tied to the reported surface.',
            ],
            rejectSignals: [
                'App assets and runtime signals are present without relevant browser errors.',
                'The issue reproduces only after backend data or permission checks fail.',
            ],
            confidence: input.storeUrl || input.storeDomain ? 'medium' : 'low',
        }),
        makeHypothesis({
            id: 'h2-installation-or-configuration',
            rank: 2,
            title: 'Installation, activation, or configuration gap',
            statement:
                'The issue may be caused by missing install state, disabled Shopify-side activation, or app configuration not applied for the store.',
            whyPlausible:
                'Many Shopify app issues depend on store-specific installation, activation, settings, scopes, or feature gates.',
            verificationGoal: 'Check store-specific app state before assuming an implementation bug.',
            recommendedGraphs: [databaseCall, codeCall],
            confirmSignals: [
                'Read-only state shows missing or disabled install/settings records.',
                'Code evidence shows a gate or setting required for this behavior.',
            ],
            rejectSignals: [
                'Store state and settings are present and enabled.',
                'The same config works on an equivalent store but runtime still fails.',
            ],
        }),
        makeHypothesis({
            id: 'h3-implementation-path',
            rank: 3,
            title: 'Implementation path or regression',
            statement:
                'The owning implementation may have a regression, incorrect condition, or missing handling for this case.',
            whyPlausible:
                'If runtime and store state do not explain the symptom, the next likely area is the code path owning the behavior.',
            verificationGoal: 'Locate the smallest owning code path and compare it with expected behavior.',
            recommendedGraphs: [codeCall],
            confirmSignals: [
                'Code search finds a focused owner with conditions matching the reported issue.',
                'Recent or relevant implementation logic can explain the observed failure.',
            ],
            rejectSignals: [
                'No relevant owner or suspicious condition is found in code.',
                'Browser or database checks already explain the failure without code changes.',
            ],
        }),
    ];

    if (
        input.caseType === 'data_missing' ||
        input.caseType === 'webhook_sync' ||
        input.caseType === 'billing_access' ||
        input.caseType === 'auth_session'
    ) {
        hypotheses.splice(
            1,
            0,
            makeHypothesis({
                id: 'h2-backend-state-or-sync',
                rank: 2,
                title: 'Backend state or sync gap',
                statement:
                    'The issue may come from missing, stale, or inconsistent backend state for the affected store.',
                whyPlausible:
                    'The case type suggests state, sync, permission, subscription, or session data could control the behavior.',
                verificationGoal: 'Use read-only checks to confirm whether expected store state exists.',
                recommendedGraphs: [databaseCall, codeCall],
                confirmSignals: [
                    'Expected store records, events, settings, or sync markers are absent or stale.',
                    'Code evidence depends on data that is missing for the store.',
                ],
                rejectSignals: [
                    'Expected backend records exist and are current.',
                    'Runtime or code evidence explains the issue independently of data state.',
                ],
            }),
        );
    }

    const ranked = hypotheses.slice(0, input.maxHypotheses).map((hypothesis, index) => ({
        ...hypothesis,
        rank: index + 1,
    }));

    return HypothesisPlanSchema.parse({
        summary: `Generated ${ranked.length} pre-diagnosis hypotheses for "${input.issue}".`,
        caseType: input.caseType,
        hypotheses: ranked,
        nextGraphCalls: dedupeGraphCalls(ranked.flatMap((hypothesis) => hypothesis.recommendedGraphs)),
        missingContext: input.missingContext,
        assumptions: [
            'Hypotheses are not confirmed root causes.',
            'Existing graphs should be called read-only unless the caller explicitly enters a fix workflow.',
        ],
    });
}

export const hypothesisPlanningTool = tool(
    async (input): Promise<HypothesisPlan> => {
        const parsed = HypothesisToolInputSchema.parse(input);

        try {
            const llm = await LlmSupportReasoning();
            const result = await llm.withStructuredOutput(HypothesisPlanSchema).invoke([
                { role: 'system', content: PROMPT },
                { role: 'user', content: JSON.stringify(parsed, null, 2) },
            ]);
            
            console.log('Raw LLM output:', result.hypotheses);

            return normalizePlan(HypothesisPlanSchema.parse(result), parsed);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`hypothesis.planning fallback: ${message}`);
            return fallbackPlan(parsed);
        }
    },
    {
        name: 'hypothesis_planning',
        description:
            'Generate concise, testable hypotheses and recommended graph calls for an app issue.',
        schema: HypothesisToolInputSchema,
    },
);
