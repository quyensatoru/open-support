import { z } from 'zod';

const UnknownRecordSchema = z.record(z.string(), z.unknown());

export const SQLClientSchema = z.enum(['pg', 'mysql2', 'sqlite3', 'mssql']);

export const SQLDatabaseConfigSchema = z.object({
    type: z.enum(['postgres', 'mysql', 'sqlite', 'mssql']),
    client: SQLClientSchema.optional(),
    dsn: z.string().trim().min(1).optional(),
    connection: UnknownRecordSchema.optional(),
    allowedTables: z.array(z.string().trim().min(1)).optional(),
});

export const MongoDatabaseConfigSchema = z.object({
    type: z.literal('mongodb'),
    uri: z.string().trim().min(1),
    db: z.string().trim().min(1),
    readOnly: z.boolean().optional(),
    sampleSize: z.number().int().positive().max(100).optional(),
});

export const RedisDatabaseConfigSchema = z.object({
    type: z.literal('redis'),
    url: z.string().trim().min(1),
    keyPrefix: z.string().optional(),
});

export const DatabaseConfigSchema = z.discriminatedUnion('type', [
    SQLDatabaseConfigSchema,
    MongoDatabaseConfigSchema,
    RedisDatabaseConfigSchema,
]);

export const AppDatabaseConfigSchema = z.record(z.string().trim().min(1), DatabaseConfigSchema);

export const DatabaseGetSchemaInputSchema = z.object({
    source: z.string().trim().min(1).optional(),
    target: z.string().trim().min(1).optional(),
    targetKind: z.enum(['collection', 'table', 'redisType', 'source']).optional(),
});

export const DatabaseSchemaResultSchema = z.object({
    ok: z.boolean(),
    availableSources: z.array(z.string()),
    sourceTypes: z.record(z.string(), z.string()),
    schemas: z.record(z.string(), z.unknown()),
    schema: z.unknown().optional(),
    source: z.string().optional(),
    target: z.string().optional(),
    targetKind: z.enum(['collection', 'table', 'redisType', 'source']).optional(),
    warnings: z.array(z.string()),
});

export const SQLReadQuerySchema = z.object({
    engine: z.literal('sql'),
    sql: z.string().trim().min(1),
    bindings: z.array(z.unknown()).optional(),
    limit: z.number().int().positive().max(500).optional(),
});

export const MongoReadQuerySchema = z
    .object({
        engine: z.literal('mongodb'),
        collection: z.string().trim().min(1),
        filter: UnknownRecordSchema.optional(),
        projection: UnknownRecordSchema.optional(),
        sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
        limit: z.number().int().positive().max(500).optional(),
        aggregate: z.array(UnknownRecordSchema).optional(),
    })
    .refine((value) => !(value.filter && value.aggregate), {
        message: 'Use either filter or aggregate, not both.',
    });

export const RedisReadOperationSchema = z.enum([
    'get',
    'mget',
    'hgetall',
    'hget',
    'lrange',
    'smembers',
    'zrange',
    'scan',
    'type',
    'ttl',
]);

export const RedisReadQuerySchema = z.object({
    engine: z.literal('redis'),
    operation: RedisReadOperationSchema,
    key: z.string(),
    keys: z.array(z.string()).optional(),
    field: z.string().optional(),
    start: z.number().int().optional(),
    end: z.number().int().optional(),
    withScores: z.boolean().optional(),
    pattern: z.string().optional(),
    count: z.number().int().positive().max(500).optional(),
    type: z.string().optional(),
});

export const DatabaseReadQuerySchema = z.discriminatedUnion('engine', [
    SQLReadQuerySchema,
    MongoReadQuerySchema,
    RedisReadQuerySchema,
]);

export const DatabaseCheckSchema = z.object({
    id: z.string().trim().min(1),
    source: z.string().trim().min(1),
    targetKind: z.enum(['collection', 'table', 'key', 'keyPattern', 'source']),
    target: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    query: DatabaseReadQuerySchema,
});

export const DatabaseThinkingInputSchema = z.object({
    app: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1),
    schema: DatabaseSchemaResultSchema,
    maxChecks: z.number().int().positive().max(20).optional(),
    sampleLimit: z.number().int().positive().max(100).optional(),
});

export const DatabaseCheckPlanSchema = z.object({
    ok: z.boolean(),
    issue: z.string(),
    checks: z.array(DatabaseCheckSchema),
    rationale: z.string(),
    warnings: z.array(z.string()),
});

export const DatabaseExecuteChecksInputSchema = z.object({
    checks: z.array(DatabaseCheckSchema),
    sampleLimit: z.number().int().positive().max(100).optional(),
});

export const DatabaseSingleCheckResultSchema = z.object({
    id: z.string(),
    source: z.string(),
    targetKind: z.enum(['collection', 'table', 'key', 'keyPattern', 'source']),
    target: z.string(),
    reason: z.string(),
    ok: z.boolean(),
    exists: z.boolean(),
    rowCount: z.number().int().nonnegative(),
    sample: z.array(UnknownRecordSchema),
    error: z.string().optional(),
});

export const DatabaseExecuteChecksResultSchema = z.object({
    ok: z.boolean(),
    results: z.array(DatabaseSingleCheckResultSchema),
    warnings: z.array(z.string()),
});

export const DatabaseInsightInputSchema = z.object({
    app: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1),
    schema: DatabaseSchemaResultSchema,
    plan: DatabaseCheckPlanSchema,
    execution: DatabaseExecuteChecksResultSchema,
});

export const DatabaseInsightResultSchema = z.object({
    ok: z.boolean(),
    summary: z.string(),
    likelySources: z.array(z.string()),
    likelyTargets: z.array(z.string()),
    findings: z.array(z.string()),
    suggestedNextChecks: z.array(z.string()),
    confidence: z.enum(['low', 'medium', 'high']),
});

export const DatabaseGraphInputSchema = z.object({
    app: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1),
    sources: AppDatabaseConfigSchema.optional(),
    source: z.string().trim().min(1).optional(),
    target: z.string().trim().min(1).optional(),
    targetKind: z.enum(['collection', 'table', 'redisType', 'source']).optional(),
    maxChecks: z.number().int().positive().max(20).optional(),
    sampleLimit: z.number().int().positive().max(100).optional(),
});

export const DatabaseGraphOutputSchema = z.object({
    app: z.string().optional(),
    issue: z.string(),
    summary: z.string(),
    schema: DatabaseSchemaResultSchema.optional(),
    plan: DatabaseCheckPlanSchema.optional(),
    execution: DatabaseExecuteChecksResultSchema.optional(),
    insight: DatabaseInsightResultSchema.optional(),
    errors: z.array(z.string()),
});

export type SQLClient = z.infer<typeof SQLClientSchema>;
export type SQLDatabaseConfig = z.infer<typeof SQLDatabaseConfigSchema>;
export type MongoDatabaseConfig = z.infer<typeof MongoDatabaseConfigSchema>;
export type RedisDatabaseConfig = z.infer<typeof RedisDatabaseConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type AppDatabaseConfig = z.infer<typeof AppDatabaseConfigSchema>;
export type DatabaseGetSchemaInput = z.infer<typeof DatabaseGetSchemaInputSchema>;
export type DatabaseSchemaResult = z.infer<typeof DatabaseSchemaResultSchema>;
export type SQLReadQuery = z.infer<typeof SQLReadQuerySchema>;
export type MongoReadQuery = z.infer<typeof MongoReadQuerySchema>;
export type RedisReadOperation = z.infer<typeof RedisReadOperationSchema>;
export type RedisReadQuery = z.infer<typeof RedisReadQuerySchema>;
export type DatabaseReadQuery = z.infer<typeof DatabaseReadQuerySchema>;
export type DatabaseCheck = z.infer<typeof DatabaseCheckSchema>;
export type DatabaseThinkingInput = z.infer<typeof DatabaseThinkingInputSchema>;
export type DatabaseCheckPlan = z.infer<typeof DatabaseCheckPlanSchema>;
export type DatabaseExecuteChecksInput = z.infer<typeof DatabaseExecuteChecksInputSchema>;
export type DatabaseSingleCheckResult = z.infer<typeof DatabaseSingleCheckResultSchema>;
export type DatabaseExecuteChecksResult = z.infer<typeof DatabaseExecuteChecksResultSchema>;
export type DatabaseInsightInput = z.infer<typeof DatabaseInsightInputSchema>;
export type DatabaseInsightResult = z.infer<typeof DatabaseInsightResultSchema>;
export type DatabaseGraphInput = z.infer<typeof DatabaseGraphInputSchema>;
export type DatabaseGraphOutput = z.infer<typeof DatabaseGraphOutputSchema>;
