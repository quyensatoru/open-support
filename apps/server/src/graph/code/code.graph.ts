import {
    Annotation,
    Command,
    END,
    INTERRUPT,
    isGraphInterrupt,
    isInterrupted,
    MemorySaver,
    START,
    StateGraph,
} from '@langchain/langgraph';

import { cloneRepos } from '../../tools/app/codebase/clone.tool.js';
import { codeContext } from '../../tools/app/codebase/context.tool.js';
import { codeGrep } from '../../tools/app/codebase/grep.tool.js';
import { codeInsight } from '../../tools/app/codebase/insight.tool.js';
import { codeThinking } from '../../tools/app/codebase/thinking.tool.js';
import type {
    CodeCloneResult,
    CodeContextResult,
    CodeGraphInput,
    CodeGraphOutput,
    CodeGraphRunResult,
    CodeGrepResult,
    CodeInsightResult,
    CodeSearchPlan,
} from './code.type.js';

export {
    CodeCloneInputSchema,
    CodeCloneResultSchema,
    CodeContextFileSchema,
    CodeContextResultSchema,
    CodeContextSnippetSchema,
    CodeGraphInputSchema,
    CodeGraphOutputSchema,
    CodeGrepMatchSchema,
    CodeGrepResultSchema,
    CodeInsightResultSchema,
    CodeRepoReferenceSchema,
    CodeRepoSchema,
    CodeSearchPlanSchema,
} from './code.type.js';
export type {
    CodeCloneInput,
    CodeCloneResult,
    CodeContextFile,
    CodeContextResult,
    CodeContextSnippet,
    CodeGraphInput,
    CodeGraphOutput,
    CodeGraphRunCompleted,
    CodeGraphRunInterrupted,
    CodeGraphRunResult,
    CodeGrepMatch,
    CodeGrepResult,
    CodeInsightResult,
    CodeRepo,
    CodeRepoInterrupt,
    CodeRepoReference,
    CodeRepoResume,
    CodeSearchPlan,
} from './code.type.js';

const CodeState = Annotation.Root({
    input: Annotation<CodeGraphInput>(),
    clone: Annotation<CodeCloneResult | undefined>(),
    thinking: Annotation<CodeSearchPlan | undefined>(),
    grep: Annotation<CodeGrepResult | undefined>(),
    context: Annotation<CodeContextResult | undefined>(),
    insight: Annotation<CodeInsightResult | undefined>(),
    errors: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    output: Annotation<CodeGraphOutput | undefined>(),
});

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

async function cloneNode(state: typeof CodeState.State) {
    try {
        const result = (await cloneRepos.invoke({
            app: state.input.app,
            repos: state.input.repos,
            repoName: state.input.repoName,
            repoNames: state.input.repoNames,
            workspace: state.input.workspace,
        })) as CodeCloneResult;

        return { clone: result };
    } catch (error) {
        if (isGraphInterrupt(error)) throw error;
        return { errors: [`code.clone_repos failed: ${errorMessage(error)}`] };
    }
}

async function thinkingNode(state: typeof CodeState.State) {
    if (!state.clone?.ok) {
        return { errors: ['code.thinking skipped: no repositories cloned or pulled.'] };
    }

    try {
        const result = await codeThinking.invoke({
            app: state.input.app,
            issue: state.input.issue,
            repoNames: state.clone.repos.map((repo) => repo.name),
            mode: state.input.mode,
        });

        return { thinking: result };
    } catch (error) {
        return { errors: [`code.thinking failed: ${errorMessage(error)}`] };
    }
}

async function grepNode(state: typeof CodeState.State) {
    if (!state.clone?.ok || !state.thinking) {
        return { errors: ['code.grep skipped: missing clone or thinking result.'] };
    }

    try {
        const result = (await codeGrep.invoke({
            workspacePath: state.clone.workspacePath,
            repos: state.clone.repos,
            fileGlobs: state.thinking.fileGlobs,
            fileRegexes: state.thinking.fileRegexes,
            contentRegexes: state.thinking.contentRegexes,
            maxMatches: state.input.maxMatches,
        })) as CodeGrepResult;

        return { grep: result };
    } catch (error) {
        return { errors: [`code.grep failed: ${errorMessage(error)}`] };
    }
}

function shouldLoadContext(state: typeof CodeState.State) {
    if (state.input.mode === 'fix' || state.thinking?.wantsFix) return 'context';
    return 'insight';
}

async function contextNode(state: typeof CodeState.State) {
    if (!state.grep?.matches.length) {
        return {
            context: {
                ok: false,
                files: [],
                warnings: ['No grep matches available for context extraction.'],
            },
        };
    }

    try {
        const result = (await codeContext.invoke({
            issue: state.input.issue,
            matches: state.grep.matches,
        })) as CodeContextResult;

        return { context: result };
    } catch (error) {
        return { errors: [`code.context failed: ${errorMessage(error)}`] };
    }
}

async function insightNode(state: typeof CodeState.State) {
    if (!state.thinking || !state.grep) {
        return { errors: ['code.insight skipped: missing thinking or grep result.'] };
    }

    try {
        const result = (await codeInsight.invoke({
            app: state.input.app,
            issue: state.input.issue,
            mode: state.input.mode,
            thinking: state.thinking,
            grep: state.grep,
            context: state.context,
        })) as CodeInsightResult;

        return { insight: result };
    } catch (error) {
        return { errors: [`code.insight failed: ${errorMessage(error)}`] };
    }
}

function finalizeNode(state: typeof CodeState.State) {
    const insightSummary = state.insight?.summary;
    const matchCount = state.grep?.matches.length ?? 0;
    const repoCount = state.clone?.repos.length ?? 0;

    const output: CodeGraphOutput = {
        app: state.input.app,
        issue: state.input.issue,
        mode: state.input.mode,
        summary:
            insightSummary ??
            `Inspected ${repoCount} repo(s) and found ${matchCount} match(es) for "${state.input.issue}".`,
        errors: state.errors,
    };

    if (state.clone) output.clone = state.clone;
    if (state.thinking) output.thinking = state.thinking;
    if (state.grep) output.grep = state.grep;
    if (state.context) output.context = state.context;
    if (state.insight) output.insight = state.insight;

    return { output };
}

const workflow = new StateGraph(CodeState)
    .addNode('clone_repos', cloneNode)
    .addNode('thinking_step', thinkingNode)
    .addNode('grep_step', grepNode)
    .addNode('context_step', contextNode)
    .addNode('insight_step', insightNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'clone_repos')
    .addEdge('clone_repos', 'thinking_step')
    .addEdge('thinking_step', 'grep_step')
    .addConditionalEdges('grep_step', shouldLoadContext, {
        context: 'context_step',
        insight: 'insight_step',
    })
    .addEdge('context_step', 'insight_step')
    .addEdge('insight_step', 'finalize')
    .addEdge('finalize', END);

const checkpointer = new MemorySaver();

export const codeGraph = workflow.compile({ checkpointer });

function threadIdFor(input: CodeGraphInput) {
    return input.threadId ?? `code-${input.app}-${Date.now()}`;
}

function interruptedResult(threadId: string, result: unknown): CodeGraphRunResult | null {
    if (!isInterrupted(result)) return null;

    return {
        status: 'interrupted',
        threadId,
        interrupts: result[INTERRUPT],
    };
}

function interruptMessage(result: CodeGraphRunResult) {
    if (result.status !== 'interrupted') return '';
    const first = result.interrupts[0]?.value;

    if (first && typeof first === 'object' && 'question' in first) {
        return String(first.question);
    }

    return JSON.stringify(first);
}

export async function invokeCodeGraphStep(input: CodeGraphInput): Promise<CodeGraphRunResult> {
    const threadId = threadIdFor(input);
    let result: Awaited<ReturnType<typeof codeGraph.invoke>>;
    try {
        result = await codeGraph.invoke({ input }, { configurable: { thread_id: threadId } });
    } catch (error) {
        if (isGraphInterrupt(error)) {
            return {
                status: 'interrupted',
                threadId,
                interrupts: error.interrupts,
            };
        }

        throw error;
    }

    const interrupted = interruptedResult(threadId, result);
    if (interrupted) return interrupted;

    if (!result.output) {
        throw new Error('Code graph returned no output');
    }

    return {
        status: 'completed',
        threadId,
        output: result.output,
    };
}

export async function resumeCodeGraphStep(
    threadId: string,
    resume: unknown,
): Promise<CodeGraphRunResult> {
    let result: Awaited<ReturnType<typeof codeGraph.invoke>>;
    try {
        result = await codeGraph.invoke(new Command({ resume }), {
            configurable: { thread_id: threadId },
        });
    } catch (error) {
        if (isGraphInterrupt(error)) {
            return {
                status: 'interrupted',
                threadId,
                interrupts: error.interrupts,
            };
        }

        throw error;
    }

    const interrupted = interruptedResult(threadId, result);
    if (interrupted) return interrupted;

    if (!result.output) {
        throw new Error('Code graph returned no output after resume');
    }

    return {
        status: 'completed',
        threadId,
        output: result.output,
    };
}

export async function invokeCodeGraph(input: CodeGraphInput): Promise<CodeGraphOutput> {
    const result = await invokeCodeGraphStep(input);
    if (result.status === 'interrupted') {
        throw new Error(`Code graph interrupted: ${interruptMessage(result)}`);
    }

    return result.output;
}

export async function resumeCodeGraph(threadId: string, resume: unknown): Promise<CodeGraphOutput> {
    const result = await resumeCodeGraphStep(threadId, resume);
    if (result.status === 'interrupted') {
        throw new Error(`Code graph interrupted again: ${interruptMessage(result)}`);
    }

    return result.output;
}
