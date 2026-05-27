import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { DBRegistry } from '../../tools/app/db/index.js';
import type { AppDBConfig } from '../../tools/app/db/types.js';
import {
    databaseExecuteChecks,
    databaseGetCollectionSchema,
    databaseInsight,
    databaseThinking,
} from '../../tools/app/db/tools/index.js';
import type {
    DatabaseCheckPlan,
    DatabaseExecuteChecksInput,
    DatabaseExecuteChecksResult,
    DatabaseGetSchemaInput,
    DatabaseGraphInput,
    DatabaseGraphOutput,
    DatabaseInsightInput,
    DatabaseInsightResult,
    DatabaseSchemaResult,
    DatabaseThinkingInput,
} from './database.type.js';

export {
    AppDatabaseConfigSchema,
    DatabaseCheckPlanSchema,
    DatabaseCheckSchema,
    DatabaseConfigSchema,
    DatabaseExecuteChecksInputSchema,
    DatabaseExecuteChecksResultSchema,
    DatabaseGetSchemaInputSchema,
    DatabaseGraphInputSchema,
    DatabaseGraphOutputSchema,
    DatabaseInsightInputSchema,
    DatabaseInsightResultSchema,
    DatabaseReadQuerySchema,
    DatabaseSchemaResultSchema,
    DatabaseSingleCheckResultSchema,
    DatabaseThinkingInputSchema,
    MongoDatabaseConfigSchema,
    MongoReadQuerySchema,
    RedisDatabaseConfigSchema,
    RedisReadOperationSchema,
    RedisReadQuerySchema,
    SQLClientSchema,
    SQLDatabaseConfigSchema,
    SQLReadQuerySchema,
} from './database.type.js';
export type {
    AppDatabaseConfig,
    DatabaseCheck,
    DatabaseCheckPlan,
    DatabaseConfig,
    DatabaseExecuteChecksInput,
    DatabaseExecuteChecksResult,
    DatabaseGetSchemaInput,
    DatabaseGraphInput,
    DatabaseGraphOutput,
    DatabaseInsightInput,
    DatabaseInsightResult,
    DatabaseReadQuery,
    DatabaseSchemaResult,
    DatabaseSingleCheckResult,
    DatabaseThinkingInput,
    MongoDatabaseConfig,
    MongoReadQuery,
    RedisDatabaseConfig,
    RedisReadOperation,
    RedisReadQuery,
    SQLClient,
    SQLDatabaseConfig,
    SQLReadQuery,
} from './database.type.js';

const DatabaseState = Annotation.Root({
    input: Annotation<DatabaseGraphInput>(),
    schema: Annotation<DatabaseSchemaResult | undefined>(),
    plan: Annotation<DatabaseCheckPlan | undefined>(),
    execution: Annotation<DatabaseExecuteChecksResult | undefined>(),
    insight: Annotation<DatabaseInsightResult | undefined>(),
    errors: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    output: Annotation<DatabaseGraphOutput | undefined>(),
});

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function initNode(state: typeof DatabaseState.State) {
    if (!state.input.sources) return {};

    try {
        await DBRegistry.initFromConfig(state.input.sources as AppDBConfig);
        return {};
    } catch (error) {
        return {
            errors: [`database.init failed: ${errorMessage(error)}`],
        };
    }
}

async function schemaNode(state: typeof DatabaseState.State) {
    try {
        const schemaInput: DatabaseGetSchemaInput = {};
        if (state.input.source) schemaInput.source = state.input.source;
        if (state.input.target) schemaInput.target = state.input.target;
        if (state.input.targetKind) schemaInput.targetKind = state.input.targetKind;

        const result = (await databaseGetCollectionSchema.invoke(schemaInput)) as DatabaseSchemaResult;
        return { schema: result };
    } catch (error) {
        return {
            errors: [`database.schema failed: ${errorMessage(error)}`],
        };
    }
}

async function thinkingNode(state: typeof DatabaseState.State) {
    if (!state.schema?.availableSources.length) {
        return {
            errors: ['database.thinking skipped: no connected database sources were found.'],
        };
    }

    try {
        const input: DatabaseThinkingInput = {
            issue: state.input.issue,
            schema: state.schema,
        };
        if (state.input.app) input.app = state.input.app;
        if (state.input.maxChecks) input.maxChecks = state.input.maxChecks;
        if (state.input.sampleLimit) input.sampleLimit = state.input.sampleLimit;

        const result = (await databaseThinking.invoke(input)) as DatabaseCheckPlan;
        return { plan: result };
    } catch (error) {
        return {
            errors: [`database.thinking failed: ${errorMessage(error)}`],
        };
    }
}

async function executeNode(state: typeof DatabaseState.State) {
    if (!state.plan?.checks.length) {
        return {
            execution: {
                ok: false,
                results: [],
                warnings: ['database.execute skipped: no database checks were planned.'],
            } satisfies DatabaseExecuteChecksResult,
        };
    }

    try {
        const input: DatabaseExecuteChecksInput = {
            checks: state.plan.checks,
        };
        if (state.input.sampleLimit) input.sampleLimit = state.input.sampleLimit;

        const result = (await databaseExecuteChecks.invoke(input)) as DatabaseExecuteChecksResult;
        return { execution: result };
    } catch (error) {
        return {
            errors: [`database.execute failed: ${errorMessage(error)}`],
        };
    }
}

async function insightNode(state: typeof DatabaseState.State) {
    if (!state.schema || !state.plan || !state.execution) {
        return {
            errors: ['database.insight skipped: missing schema, plan, or execution result.'],
        };
    }

    try {
        const input: DatabaseInsightInput = {
            issue: state.input.issue,
            schema: state.schema,
            plan: state.plan,
            execution: state.execution,
        };
        if (state.input.app) input.app = state.input.app;

        const result = (await databaseInsight.invoke(input)) as DatabaseInsightResult;
        return { insight: result };
    } catch (error) {
        return {
            errors: [`database.insight failed: ${errorMessage(error)}`],
        };
    }
}

function finalizeNode(state: typeof DatabaseState.State) {
    const checkCount = state.plan?.checks.length ?? 0;
    const foundCount = state.execution?.results.filter((result) => result.exists).length ?? 0;
    const sourceCount = state.schema?.availableSources.length ?? 0;

    const output: DatabaseGraphOutput = {
        issue: state.input.issue,
        summary:
            state.insight?.summary ??
            `Checked ${checkCount} database target(s) across ${sourceCount} source(s); ${foundCount} target(s) returned data.`,
        errors: state.errors,
    };

    if (state.input.app) output.app = state.input.app;
    if (state.schema) output.schema = state.schema;
    if (state.plan) output.plan = state.plan;
    if (state.execution) output.execution = state.execution;
    if (state.insight) output.insight = state.insight;

    return { output };
}

const workflow = new StateGraph(DatabaseState)
    .addNode('init_sources', initNode)
    .addNode('get_schema', schemaNode)
    .addNode('plan_checks', thinkingNode)
    .addNode('execute_checks', executeNode)
    .addNode('summarize_insight', insightNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'init_sources')
    .addEdge('init_sources', 'get_schema')
    .addEdge('get_schema', 'plan_checks')
    .addEdge('plan_checks', 'execute_checks')
    .addEdge('execute_checks', 'summarize_insight')
    .addEdge('summarize_insight', 'finalize')
    .addEdge('finalize', END);

export const databaseGraph = workflow.compile();

export async function invokeDatabaseGraph(
    input: DatabaseGraphInput,
): Promise<DatabaseGraphOutput> {
    const result = await databaseGraph.invoke({ input });
    if (!result.output) {
        throw new Error('Database graph returned no output');
    }

    return result.output;
}
