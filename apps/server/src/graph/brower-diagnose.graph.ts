import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { BrowseDevtool, BrowserDevice, BrowserEngine } from '../playwright/type.js';
import { diagnoseSite } from '../tools/diagnose-site.tool.js';
import { detectSite as detectBrowserSite } from '../tools/detect-site.tool.js';
import { detectSite as grepDetectedSite } from '../tools/detect-grep.tool.js';
import { evaluateKeyword as evaluateKeywordSite, saveMemory } from '../tools/evaluate-keyword.tool.js';

const DEFAULT_DETECT_TOOLS = [
    BrowseDevtool.Dom,
    BrowseDevtool.Network,
    BrowseDevtool.Script,
    BrowseDevtool.Console,
];

export type BrowserDiagnoseGraphInput = {
    url: string;
    app: string; 
    tools?: BrowseDevtool[];
    metadata?: {
        engine?: BrowserEngine;
        device?: BrowserDevice;
    };
};

export type BrowserDetectResult = {
    ok: boolean
    runId: string;
    url: string;
    filePath?: string;
    signalCount?: number;
};

export type DetectMemory = {
    success: string[];
    failed: string[];
};

export type EvaluateKeywordResult = {
    ok: boolean;
    keywords: string[];
    app: string;
    memory: DetectMemory;
}

export type BrowserGrepResult = {
    ok: boolean;
    runId?: string;
    keywords?: string[];
    matchCount?: number;
    matches?: string[];
    skipped?: boolean;
    reason?: string;
};

export type BrowserDiagnoseResult = {
    url?: string;
    finalUrl?: string;
    engine?: BrowserEngine;
    device?: BrowserDevice;
    ok: boolean;
    status?: number | null;
    statusText?: string;
    title?: string;
    error?: string;
};

export type BrowserDiagnoseGraphOutput = {
    url: string;
    summary: string;
    detect?: BrowserDetectResult;
    grep?: BrowserGrepResult;
    diagnose?: BrowserDiagnoseResult;
    errors: string[];
};

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
    attempts: Annotation<number>(),
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
        const result = await detectBrowserSite.invoke({
            url: state.input.url,
            tools: state.input.tools ?? DEFAULT_DETECT_TOOLS,
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
    const app = state.input.app
    try {
        const result = await evaluateKeywordSite.invoke({
            app
        });
        console.log("evaluate: ", result)

        return { evaluate: result };
    } catch (error) {
        return {
            errors: [`evaluate.keyword failed: ${errorMessage(error)}`],
        };
    } finally {
        state.attempts = (state.attempts || 0) + 1
    }
}

async function grepNode(state: typeof BrowserDiagnoseState.State) {
    const keywords = state.evaluate.keywords;
    if (!keywords?.length) {
        return {
            grep: {
                ok: false,
                skipped: true,
                reason: 'No keyword founded.',
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
        const result = await grepDetectedSite.invoke({
            runId: state.detect.runId,
            keywords: keywords,
        });

        saveMemory(state.evaluate.app, {
            failed: [],
            success: keywords
        })

        return { grep: result };
    } catch (error) {
        saveMemory(state.evaluate.app, {
            failed: keywords,
            success: []
        })
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
        const result = await diagnoseSite.invoke({
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

    if (typeof state.detect?.signalCount === 'number') {
        parts.push(`captured ${state.detect.signalCount} browser signals`);
    }

    if (state.input.app && typeof state.grep?.matchCount === 'number') {
        parts.push(`found ${state.grep.matchCount} matches for app "${state.input.app}"`);
    }

    if (state.diagnose?.status) {
        parts.push(`HTTP status ${state.diagnose.status}`);
    }

    if (state.errors.length > 0) {
        parts.push(`completed with ${state.errors.length} warning(s)`);
    }

    const output: BrowserDiagnoseGraphOutput = {
        url: state.input.url,
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
        next: 'diagnose_site'
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
