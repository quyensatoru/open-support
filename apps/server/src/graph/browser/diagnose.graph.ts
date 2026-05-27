import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { BrowseDevtool, BrowserDevice, BrowserEngine } from '../../playwright/type.js';
import { diagnoseBrowser } from '../../tools/browser/diagnose-browser.tool.js';
import { crawlBrower } from '../../tools/browser/crawl-browser.tool.js';
import { grepBrowser } from '../../tools/browser/grep-browser.tool.js';
import { evaluateKeywordBrowser } from '../../tools/browser/evaluate-keyword.tool.js';
import type {
    BrowserDetectResult,
    BrowserDiagnoseGraphInput,
    BrowserDiagnoseGraphOutput,
    BrowserDiagnoseResult,
    BrowserGrepResult,
    EvaluateKeywordResult,
} from './diagnose.types.js';

export { DevtoolKeywordSchema, SignalCount, SignalMatch } from './diagnose.types.js';
export type {
    BrowserDetectResult,
    BrowserDiagnoseGraphInput,
    BrowserDiagnoseGraphOutput,
    BrowserDiagnoseResult,
    BrowserGrepResult,
    DetectMemory,
    DevtoolKeywordType,
    EvaluateKeywordResult,
    SignalCountType,
    SignalMatchType,
} from './diagnose.types.js';

const DEFAULT_DETECT_TOOLS = [
    BrowseDevtool.Dom,
    BrowseDevtool.Network,
    BrowseDevtool.Script,
    BrowseDevtool.Console,
];

const BrowserDiagnoseState = Annotation.Root({
    input: Annotation<BrowserDiagnoseGraphInput>(),
    detect: Annotation<BrowserDetectResult>(),
    evaluate: Annotation<EvaluateKeywordResult>(),
    grep: Annotation<BrowserGrepResult>(),
    diagnose: Annotation<BrowserDiagnoseResult>(),
    errors: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    attempts: Annotation<number>({
        reducer: (left, right) => left + right,
        default: () => 0,
    }),
    output: Annotation<BrowserDiagnoseGraphOutput>(),
});

function getMetadata(input: BrowserDiagnoseGraphInput) {
    return {
        engine: input.metadata?.engine ?? BrowserEngine.Chromium,
        device: input.metadata?.device ?? BrowserDevice.Desktop,
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function detectNode(state: typeof BrowserDiagnoseState.State) {
    try {
        const result = await crawlBrower.invoke({
            url: state.input.url,
            devtools: state.input.devtools ?? DEFAULT_DETECT_TOOLS,
            metadata: getMetadata(state.input),
        });

        return { detect: result };
    } catch (error) {
        return {
            errors: [`browser.detect failed: ${errorMessage(error)}`],
        };
    }
}

async function evaluateNote(state: typeof BrowserDiagnoseState.State) {
    const app = state.input.app;
    const devtools = state.input.devtools ?? DEFAULT_DETECT_TOOLS;
    try {
        const result = await evaluateKeywordBrowser.invoke({
            app,
            devtools,
        });

        console.log('evaluate: ', result.byTools);

        return { evaluate: result, attempts: 1 };
    } catch (error) {
        return {
            errors: [`evaluate.keyword failed: ${errorMessage(error)}`],
            attempts: 1,
        };
    }
}

async function grepNode(state: typeof BrowserDiagnoseState.State) {
    if (!state.evaluate.ok) {
        return {
            grep: {
                ok: false,
                skipped: true,
                reason: 'evaluate keyword not found',
            },
        };
    }

    const keywordsByDevtool = state.evaluate.byTools;
    const devtools = state.input.devtools || DEFAULT_DETECT_TOOLS;

    if (!keywordsByDevtool || !Object.values(keywordsByDevtool).length) {
        return {
            grep: {
                ok: false,
                skipped: true,
                reason: 'No keyword for each devtool type not found.',
            },
        };
    }

    if (!state.detect?.runId) {
        return {
            grep: {
                ok: false,
                skipped: true,
                reason: 'browser.detect did not return a runId.',
            },
            errors: ['system.grep skipped because browser.detect did not return a runId'],
        };
    }

    try {
        const result = await grepBrowser.invoke({
            runId: state.detect.runId,
            keywordsByDevtool,
            devtools,
        });

        return { grep: result };
    } catch (error) {
        return {
            errors: [`system.grep failed: ${errorMessage(error)}`],
        };
    }
}

function shouldContinue(state: typeof BrowserDiagnoseState.State) {
    if (state.grep.ok) return 'next';

    // tránh loop vô hạn
    if (state.attempts >= 5) return 'done';

    return 'retry';
}

async function diagnoseNode(state: typeof BrowserDiagnoseState.State) {
    try {
        const result = await diagnoseBrowser.invoke({
            url: state.input.url,
            metadata: getMetadata(state.input),
        });

        return { diagnose: result };
    } catch (error) {
        return {
            errors: [`browser.diagnose failed: ${errorMessage(error)}`],
        };
    }
}

function finalizeNode(state: typeof BrowserDiagnoseState.State) {
    const parts = [`Scanned ${state.input.url}`];

    if (state.detect?.signalCount) {
        parts.push(`captured ${JSON.stringify(state.detect.signalCount, null, 2)} browser signals`);
    }

    if (state.input.app && state.grep.matches) {
        console.log(state.grep.matches);
        parts.push(
            `found ${JSON.stringify(state.grep.matches, null, 2)} matches for app "${state.input.app}"`,
        );
    }

    if (state.diagnose?.status) {
        parts.push(`HTTP status ${state.diagnose.status}`);
    }

    if (state.errors.length > 0) {
        parts.push(`completed with ${state.errors.length} warning(s)`);
    }

    if (state.grep.matches) {
        parts.push(`matched: ${JSON.stringify(state.grep.matches, null, 2)}`);
    }

    const output: BrowserDiagnoseGraphOutput = {
        url: state.input.url,
        app: state.input.app,
        devtools: state.input.devtools || DEFAULT_DETECT_TOOLS,
        summary: `${parts.join('; ')}.`,
        errors: state.errors,
    };

    if (state.detect) {
        output.detect = state.detect;
    }

    if (state.grep) {
        output.grep = state.grep;
    }

    if (state.diagnose) {
        output.diagnose = state.diagnose;
    }

    console.log(output);
    return { output };
}

const workflow = new StateGraph(BrowserDiagnoseState)
    .addNode('detect_site', detectNode)
    .addNode('evaluate_keyword', evaluateNote)
    .addNode('grep_signals', grepNode)
    .addNode('diagnose_site', diagnoseNode)
    .addNode('finalize_output', finalizeNode)
    .addEdge(START, 'detect_site')
    .addEdge('detect_site', 'evaluate_keyword')
    .addEdge('evaluate_keyword', 'grep_signals')
    .addConditionalEdges('grep_signals', shouldContinue, {
        retry: 'evaluate_keyword',
        done: END,
        next: 'diagnose_site',
    })
    .addEdge('diagnose_site', 'finalize_output')
    .addEdge('finalize_output', END);

export const graphDiagnose = workflow.compile();

export async function invokeBrowserDiagnoseGraph(
    input: BrowserDiagnoseGraphInput,
): Promise<BrowserDiagnoseGraphOutput> {
    const result = await graphDiagnose.invoke({ input });
    if (!result.output) {
        throw new Error('Browser diagnose graph returned no output');
    }
    return result.output;
}
