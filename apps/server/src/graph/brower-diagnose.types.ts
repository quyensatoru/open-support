import { z } from 'zod';

import { BrowseDevtool, BrowserDevice, BrowserEngine } from '../playwright/type.js';

const StringArraySchema = z.array(z.string());

export const DomSignalSchema = z.array(z.object({
    tag: z.string(),
    id: z.string().optional(),
    className: z.string().optional(),
    attrs: z.string().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
}));

export const DevtoolKeywordSchema = z.object({
    [BrowseDevtool.Dom]: StringArraySchema,
    [BrowseDevtool.Script]: StringArraySchema,
    [BrowseDevtool.Network]: StringArraySchema,
    [BrowseDevtool.Console]: StringArraySchema,
    [BrowseDevtool.Cookie]: StringArraySchema,
    [BrowseDevtool.Global]: StringArraySchema,
    [BrowseDevtool.Application]: StringArraySchema,
});

export const StructuredSignalSchema = z.object({
    [BrowseDevtool.Dom]: DomSignalSchema.optional(),

    [BrowseDevtool.Script]: StringArraySchema.optional(),
    [BrowseDevtool.Network]: StringArraySchema.optional(),
    [BrowseDevtool.Console]: StringArraySchema.optional(),
    [BrowseDevtool.Cookie]: StringArraySchema.optional(),
    [BrowseDevtool.Global]: StringArraySchema.optional(),
    [BrowseDevtool.Application]: StringArraySchema.optional(),
});

export const SignalCount = z
    .object(
        Object.fromEntries(
            Object.values(BrowseDevtool).map((key) => [
                key,
                z.number().optional(),
            ]),
        ) as Record<BrowseDevtool, z.ZodOptional<z.ZodNumber>>,
    )
    .strict();

export const SignalMatch = z
    .object(
        Object.fromEntries(
            Object.values(BrowseDevtool).map((key) => [
                key,
                z.array(z.string()).optional(),
            ]),
        ) as Record<BrowseDevtool, z.ZodOptional<z.ZodArray<z.ZodString>>>,
    )
    .strict();

export type DomSignalType = z.infer<typeof DomSignalSchema>;
export type StructuredSignalType = z.infer<typeof StructuredSignalSchema>;
export type DevtoolKeywordType = z.infer<typeof DevtoolKeywordSchema>;
export type SignalCountType = z.infer<typeof SignalCount>;
export type SignalMatchType = z.infer<typeof SignalMatch>;

export type BrowserDiagnoseGraphInput = {
    url: string;
    app: string;
    devtools?: BrowseDevtool[];
    metadata?: {
        engine?: BrowserEngine;
        device?: BrowserDevice;
    };
};

export type BrowserDetectResult = {
    ok: boolean;
    runId: string;
    url: string;
    filePath?: string;
    signalCount?: SignalCountType;
};

export type DetectMemory = {
    success: string[];
    failed: string[];
};

export type EvaluateKeywordResult = {
    ok: boolean;
    keywords: string[];
    app: string;
    byTools?: DevtoolKeywordType;
    memory: DetectMemory;
};

export type BrowserGrepResult = {
    ok: boolean;
    runId?: string;
    keywordsByDevtool?: DevtoolKeywordType;
    devtools?: BrowseDevtool[];
    matches?: SignalMatchType;
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
    app: string;
    devtools: BrowseDevtool[];
    summary: string;
    detect?: BrowserDetectResult;
    grep?: BrowserGrepResult;
    diagnose?: BrowserDiagnoseResult;
    errors: string[];
};
