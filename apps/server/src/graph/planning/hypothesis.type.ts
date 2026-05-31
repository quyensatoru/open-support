import { z } from 'zod';

export const HypothesisCaseTypeSchema = z.enum([
    'storefront_runtime',
    'embedded_admin_ui',
    'installation_activation',
    'script_loading',
    'data_missing',
    'auth_session',
    'billing_access',
    'webhook_sync',
    'api_permission',
    'performance',
    'configuration',
    'unknown',
]);

export const HypothesisGraphNameSchema = z.enum([
    'browserDiagnoseGraph',
    'codeGraph',
    'databaseGraph',
]);

export const HypothesisPrioritySchema = z.enum(['high', 'medium', 'low']);
export const HypothesisConfidenceSchema = z.enum(['low', 'medium']);

const EmptyHypothesisGraphInputHints = {
    app: null,
    issue: null,
    url: null,
    storeDomain: null,
    mode: null,
} as const;

export const HypothesisGraphInputHintsSchema = z
    .object({
        app: z.string().trim().min(1).nullable().default(null),
        issue: z.string().trim().min(1).nullable().default(null),
        url: z.string().trim().min(1).nullable().default(null),
        storeDomain: z.string().trim().min(1).nullable().default(null),
        mode: z.enum(['search']).nullable().default(null),
    })
    .strict()
    .default(EmptyHypothesisGraphInputHints);

export const HypothesisIdentifierSchema = z.object({
    kind: z.enum(['store_domain', 'url', 'order_id', 'customer_id', 'product_id', 'other']),
    value: z.string().trim().min(1),
});

export const HypothesisKnownFactSchema = z.object({
    id: z.string().trim().min(1),
    content: z.string().trim().min(1),
});

export const HypothesisGraphCallSchema = z.object({
    graph: HypothesisGraphNameSchema,
    priority: HypothesisPrioritySchema,
    reason: z.string().trim().min(1),
    inputHints: HypothesisGraphInputHintsSchema,
    expectedSignals: z.array(z.string().trim().min(1)).min(1),
});

export const HypothesisSchema = z.object({
    id: z.string().trim().min(1),
    rank: z.number().int().positive(),
    title: z.string().trim().min(1),
    statement: z.string().trim().min(1),
    whyPlausible: z.string().trim().min(1),
    verificationGoal: z.string().trim().min(1),
    recommendedGraphs: z.array(HypothesisGraphCallSchema).min(1),
    confirmSignals: z.array(z.string().trim().min(1)).min(1),
    rejectSignals: z.array(z.string().trim().min(1)).min(1),
    confidence: HypothesisConfidenceSchema,
});

export const HypothesisPlanSchema = z.object({
    summary: z.string().trim().min(1),
    caseType: HypothesisCaseTypeSchema,
    hypotheses: z.array(HypothesisSchema).min(1).max(6),
    nextGraphCalls: z.array(HypothesisGraphCallSchema),
    missingContext: z.array(z.string().trim().min(1)).default([]),
    assumptions: z.array(z.string().trim().min(1)).default([]),
});

export const HypothesisNormalizedInputSchema = z.object({
    app: z.string().trim().min(1),
    issue: z.string().trim().min(1),
    storeUrl: z.string().trim().min(1).optional(),
    storeDomain: z.string().trim().min(1).optional(),
    identifiers: z.array(HypothesisIdentifierSchema),
});

export const HypothesisToolInputSchema = z.object({
    app: z.string().trim().min(1),
    issue: z.string().trim().min(1),
    storeUrl: z.string().trim().min(1).optional(),
    storeDomain: z.string().trim().min(1).optional(),
    identifiers: z.array(HypothesisIdentifierSchema).default([]),
    caseType: HypothesisCaseTypeSchema,
    knownFacts: z.array(HypothesisKnownFactSchema).default([]),
    candidateGraphCalls: z.array(HypothesisGraphCallSchema).default([]),
    missingContext: z.array(z.string().trim().min(1)).default([]),
    maxHypotheses: z.number().int().positive().max(6).default(4),
});

export const HypothesisGraphInputSchema = z
    .object({
        app: z.string().trim().min(1),
        issue: z.string().trim().min(1).optional(),
        question: z.string().trim().min(1).optional(),
        storeUrl: z.string().trim().min(1).optional(),
        storeDomain: z.string().trim().min(1).optional(),
        maxHypotheses: z.number().int().positive().max(6).optional(),
        availableGraphs: z.array(HypothesisGraphNameSchema).optional(),
    })
    .refine((value) => Boolean(value.issue ?? value.question), {
        message: 'HypothesisGraphInput requires either issue or question.',
        path: ['issue'],
    });

export const HypothesisGraphOutputSchema = z.object({
    app: z.string(),
    issue: z.string(),
    storeUrl: z.string().optional(),
    storeDomain: z.string().optional(),
    identifiers: z.array(HypothesisIdentifierSchema),
    caseType: HypothesisCaseTypeSchema,
    knownFacts: z.array(HypothesisKnownFactSchema),
    plan: HypothesisPlanSchema,
    summary: z.string(),
    errors: z.array(z.string()),
});

export type HypothesisCaseType = z.infer<typeof HypothesisCaseTypeSchema>;
export type HypothesisGraphName = z.infer<typeof HypothesisGraphNameSchema>;
export type HypothesisPriority = z.infer<typeof HypothesisPrioritySchema>;
export type HypothesisConfidence = z.infer<typeof HypothesisConfidenceSchema>;
export type HypothesisGraphInputHints = z.infer<typeof HypothesisGraphInputHintsSchema>;
export type HypothesisIdentifier = z.infer<typeof HypothesisIdentifierSchema>;
export type HypothesisKnownFact = z.infer<typeof HypothesisKnownFactSchema>;
export type HypothesisGraphCall = z.infer<typeof HypothesisGraphCallSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type HypothesisPlan = z.infer<typeof HypothesisPlanSchema>;
export type HypothesisNormalizedInput = z.infer<typeof HypothesisNormalizedInputSchema>;
export type HypothesisToolInput = z.infer<typeof HypothesisToolInputSchema>;
export type HypothesisGraphInput = z.infer<typeof HypothesisGraphInputSchema>;
export type HypothesisGraphOutput = z.infer<typeof HypothesisGraphOutputSchema>;
