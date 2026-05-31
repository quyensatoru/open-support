import { invokeHypothesisGraph } from './graph/planning/hypothesis.graph.js';
import {
    HypothesisGraphInputSchema,
    type HypothesisGraphInput,
    type HypothesisGraphName,
} from './graph/planning/hypothesis.type.js';
import { logger } from './observability/logger.js';

function parseGraphName(raw: string): HypothesisGraphName {
    if (raw === 'browserDiagnoseGraph' || raw === 'codeGraph' || raw === 'databaseGraph') {
        return raw;
    }

    throw new Error(
        'HYPOTHESIS_TEST_AVAILABLE_GRAPHS must contain only: browserDiagnoseGraph, codeGraph, databaseGraph',
    );
}

function parseAvailableGraphs(): HypothesisGraphName[] | undefined {
    const raw = process.env.HYPOTHESIS_TEST_AVAILABLE_GRAPHS;
    if (!raw?.trim()) return undefined;

    return raw
        .split(/[,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map(parseGraphName);
}

function buildInput(): HypothesisGraphInput {
    const input: HypothesisGraphInput = {
        app: "mida recordings and heatmap",
        issue: 'Khách báo cáo lỗi không xem được heatmap và recording trên mida, cần tìm hiểu nguyên nhân và cách khắc phục',
        maxHypotheses: 6,
    };

    if (process.env.HYPOTHESIS_TEST_STORE_URL) {
        input.storeUrl = process.env.HYPOTHESIS_TEST_STORE_URL;
    }

    if (process.env.HYPOTHESIS_TEST_STORE_DOMAIN) {
        input.storeDomain = process.env.HYPOTHESIS_TEST_STORE_DOMAIN;
    }

    const availableGraphs = parseAvailableGraphs();
    if (availableGraphs?.length) {
        input.availableGraphs = availableGraphs;
    }

    return HypothesisGraphInputSchema.parse(input);
}

const result = await invokeHypothesisGraph(buildInput());

console.log('\nHypothesis summary:');
console.dir(result.summary, { depth: null });

console.log('\nCase:');
console.dir(
    {
        caseType: result.caseType,
        storeUrl: result.storeUrl,
        storeDomain: result.storeDomain,
        missingContext: result.plan.missingContext,
    },
    { depth: null },
);

console.log('\nHypotheses:');
for (const hypothesis of result.plan.hypotheses) {
    console.log(`\n${hypothesis.rank}. [${hypothesis.confidence}] ${hypothesis.title}`);
    console.log(`   statement: ${hypothesis.statement}`);
    console.log(`   verify: ${hypothesis.verificationGoal}`);
    console.log(
        `   graphs: ${hypothesis.recommendedGraphs
            .map((call) => `${call.graph}:${call.priority}`)
            .join(', ')}`,
    );
}

console.log('\nNext graph calls:');
console.dir(result.plan.nextGraphCalls, { depth: null });

if (result.errors.length) {
    console.log('\nErrors/warnings:');
    console.dir(result.errors, { depth: null });
}

logger.info('hypothesis agent test finished');
