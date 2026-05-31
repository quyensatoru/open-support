import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { executeGraphCall, stepSummary } from '../registry.js';
import { invokeHypothesisGraph } from '../planning/hypothesis.graph.js';
import type { HypothesisGraphCall, HypothesisGraphOutput } from '../planning/hypothesis.type.js';
import {
    SupportExecutorGraphNameSchema,
    SupportGraphInputSchema,
    SupportGraphOutputSchema,
    type ParsedSupportGraphInput,
    type SupportEvidence,
    type SupportExecutorGraphName,
    type SupportGraphInput,
    type SupportGraphName,
    type SupportGraphOutput,
    type SupportGraphStep,
    type SupportMemorySnapshot,
} from './support.type.js';

export {
    SupportExecutorGraphNameSchema,
    SupportGraphInputSchema,
    SupportGraphNameSchema,
    SupportGraphOutputSchema,
    SupportGraphStatusSchema,
    SupportGraphStepSchema,
    SupportMemorySnapshotSchema,
    SupportRunModeSchema,
    SupportStepStatusSchema,
} from './support.type.js';
export type {
    SupportEvidence,
    SupportExecutorGraphName,
    SupportGraphInput,
    SupportGraphName,
    SupportGraphOutput,
    SupportGraphStatus,
    SupportGraphStep,
    SupportMemorySnapshot,
    ParsedSupportGraphInput,
    SupportRunMode,
    SupportStepStatus,
} from './support.type.js';

const SupportState = Annotation.Root({
    input: Annotation<ParsedSupportGraphInput>(),
    memoriesUsed: Annotation<SupportMemorySnapshot[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    hypothesis: Annotation<HypothesisGraphOutput | undefined>(),
    calls: Annotation<HypothesisGraphCall[]>({
        reducer: (_left, right) => right,
        default: () => [],
    }),
    steps: Annotation<SupportGraphStep[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    missingContext: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    errors: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    output: Annotation<SupportGraphOutput | undefined>(),
});

function nowIso(): string {
    return new Date().toISOString();
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function unique(items: string[]): string[] {
    return [...new Set(items.filter(Boolean))];
}

function isExecutorGraph(graph: SupportGraphName): graph is SupportExecutorGraphName {
    return SupportExecutorGraphNameSchema.safeParse(graph).success;
}

function executorOrder(input: ParsedSupportGraphInput): SupportExecutorGraphName[] {
    const ordered = input.graphOrder.filter(isExecutorGraph);
    return ordered.length ? ordered : ['browserDiagnoseGraph', 'codeGraph', 'databaseGraph'];
}

function priorityRank(priority: HypothesisGraphCall['priority']): number {
    if (priority === 'high') return 0;
    if (priority === 'medium') return 1;
    return 2;
}

function orderedCalls(
    calls: HypothesisGraphCall[],
    order: SupportExecutorGraphName[],
): HypothesisGraphCall[] {
    const orderRank = new Map(order.map((graph, index) => [graph, index]));
    const seen = new Set<SupportExecutorGraphName>();

    return calls
        .filter((call) => orderRank.has(call.graph))
        .sort((left, right) => {
            const byOrder = (orderRank.get(left.graph) ?? 999) - (orderRank.get(right.graph) ?? 999);
            if (byOrder !== 0) return byOrder;
            return priorityRank(left.priority) - priorityRank(right.priority);
        })
        .filter((call) => {
            if (seen.has(call.graph)) return false;
            seen.add(call.graph);
            return true;
        });
}

function hypothesisStep(input: {
    status: SupportGraphStep['status'];
    reason?: string;
    request: Record<string, unknown>;
    output?: unknown;
    error?: string;
    startedAt: string;
}): SupportGraphStep {
    const finishedAt = nowIso();
    return {
        stepKey: `hypothesisGraph:${input.startedAt}`,
        graph: 'hypothesisGraph',
        status: input.status,
        input: input.request,
        startedAt: input.startedAt,
        finishedAt,
        metadata: {},
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.output !== undefined ? { output: input.output } : {}),
        ...(input.error ? { error: input.error } : {}),
    };
}

async function loadMemoryNode(state: typeof SupportState.State) {
    return {
        memoriesUsed: state.input.memories.slice(0, 20),
    };
}

async function hypothesisNode(state: typeof SupportState.State) {
    const startedAt = nowIso();
    const availableGraphs = executorOrder(state.input);
    const request = {
        app: state.input.app,
        issue: state.input.issue,
        storeUrl: state.input.storeUrl,
        storeDomain: state.input.storeDomain,
        maxHypotheses: state.input.maxHypotheses,
        availableGraphs,
    };

    try {
        const hypothesis = await invokeHypothesisGraph(request);
        return {
            hypothesis,
            missingContext: hypothesis.plan.missingContext,
            errors: hypothesis.errors,
            steps: [
                hypothesisStep({
                    status: 'completed',
                    reason: 'Generated support hypotheses and next graph calls.',
                    request,
                    output: hypothesis,
                    startedAt,
                }),
            ],
        };
    } catch (error) {
        const message = errorMessage(error);
        return {
            errors: [`support.hypothesis failed: ${message}`],
            steps: [
                hypothesisStep({
                    status: 'failed',
                    request,
                    error: message,
                    startedAt,
                }),
            ],
        };
    }
}

async function routeNode(state: typeof SupportState.State) {
    if (!state.hypothesis) {
        return {
            missingContext: ['hypothesis output is required before routing executor graphs'],
        };
    }

    const calls = orderedCalls(state.hypothesis.plan.nextGraphCalls, executorOrder(state.input));
    return { calls };
}

async function executeNode(state: typeof SupportState.State) {
    if (!state.calls.length) {
        return {
            missingContext: ['no executor graph call was selected by the workflow policy'],
        };
    }

    const steps: SupportGraphStep[] = [];
    for (const call of state.calls) {
        steps.push(await executeGraphCall(call, state.input));
    }

    return { steps };
}

function evidenceFromSteps(steps: SupportGraphStep[]): SupportEvidence[] {
    return steps.map((step) => ({
        graph: step.graph,
        status: step.status,
        ...(stepSummary(step) ? { summary: stepSummary(step) } : {}),
        ...(step.reason ? { reason: step.reason } : {}),
    }));
}

function outputStatus(steps: SupportGraphStep[]): SupportGraphOutput['status'] {
    if (!steps.length || steps.every((step) => step.status === 'failed')) return 'failed';
    if (steps.some((step) => step.status === 'interrupted')) return 'interrupted';
    if (steps.some((step) => step.status === 'failed')) return 'partial';

    const executorSteps = steps.filter((step) => step.graph !== 'hypothesisGraph');
    if (executorSteps.length && executorSteps.every((step) => step.status === 'skipped')) {
        return 'partial';
    }

    return 'completed';
}

function summarize(state: typeof SupportState.State): string {
    const completed = state.steps.filter((step) => step.status === 'completed');
    const skipped = state.steps.filter((step) => step.status === 'skipped');
    const interrupted = state.steps.filter((step) => step.status === 'interrupted');
    const failed = state.steps.filter((step) => step.status === 'failed');
    const lead =
        state.hypothesis?.summary ?? `Built a support investigation for "${state.input.issue}".`;
    const evidence = completed
        .map((step) => `${step.graph}: ${stepSummary(step) ?? 'completed'}`)
        .slice(0, 3);
    const suffix = [
        evidence.length ? `Evidence: ${evidence.join(' | ')}` : '',
        skipped.length ? `${skipped.length} graph(s) skipped for missing config/context.` : '',
        interrupted.length ? `${interrupted.length} graph(s) interrupted and need input.` : '',
        failed.length ? `${failed.length} graph(s) failed.` : '',
    ].filter(Boolean);

    return suffix.length ? `${lead} ${suffix.join(' ')}` : lead;
}

function finalizeNode(state: typeof SupportState.State) {
    const stepErrors = state.steps.flatMap((step) => (step.error ? [step.error] : []));
    const skippedContext = state.steps
        .filter((step) => step.status === 'skipped')
        .map((step) => step.reason ?? `${step.graph} skipped`);
    const output: SupportGraphOutput = {
        app: state.input.app,
        issue: state.input.issue,
        mode: state.input.mode,
        status: outputStatus(state.steps),
        summary: summarize(state),
        steps: state.steps,
        evidence: evidenceFromSteps(state.steps),
        memoriesUsed: state.memoriesUsed,
        missingContext: unique([...state.missingContext, ...skippedContext]),
        errors: unique([...state.errors, ...stepErrors]),
        ...(state.input.appKey ? { appKey: state.input.appKey } : {}),
        ...(state.input.storeUrl ? { storeUrl: state.input.storeUrl } : {}),
        ...(state.input.storeDomain ? { storeDomain: state.input.storeDomain } : {}),
        ...(state.input.threadId ? { threadId: state.input.threadId } : {}),
        ...(state.hypothesis ? { hypothesis: state.hypothesis } : {}),
    };

    return { output: SupportGraphOutputSchema.parse(output) };
}

const workflow = new StateGraph(SupportState)
    .addNode('load_memory', loadMemoryNode)
    .addNode('plan_hypotheses', hypothesisNode)
    .addNode('route_graphs', routeNode)
    .addNode('execute_graphs', executeNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'load_memory')
    .addEdge('load_memory', 'plan_hypotheses')
    .addEdge('plan_hypotheses', 'route_graphs')
    .addEdge('route_graphs', 'execute_graphs')
    .addEdge('execute_graphs', 'finalize')
    .addEdge('finalize', END);

export const supportGraph = workflow.compile();

export async function invokeSupportGraph(input: SupportGraphInput): Promise<SupportGraphOutput> {
    const parsed = SupportGraphInputSchema.parse(input);
    const result = await supportGraph.invoke({ input: parsed });

    if (!result.output) {
        throw new Error('Support graph returned no output');
    }

    return result.output;
}
