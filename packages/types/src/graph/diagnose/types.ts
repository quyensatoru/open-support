import { BrowseDevtool, BrowserDevice, BrowserEngine } from "../../tools/types.js";

export type BrowserDiagnoseGraphInput = {
    url: string;
    hint?: string;
    tools?: BrowseDevtool[];
    metadata?: {
        engine?: BrowserEngine;
        device?: BrowserDevice;
    };
};

export type BrowserDetectResult = {
    runId?: string;
    filePath?: string;
    url?: string;
    signalCount?: number;
    raw?: string;
};

export type BrowserGrepResult = {
    runId?: string;
    hint?: string;
    matchCount?: number;
    matches?: string[];
    skipped?: boolean;
    reason?: string;
    raw?: string;
};

export type BrowserDiagnoseResult = {
    url?: string;
    finalUrl?: string;
    engine?: BrowserEngine;
    device?: BrowserDevice;
    ok?: boolean;
    status?: number | null;
    statusText?: string;
    title?: string;
    error?: string;
    raw?: string;
};

export type BrowserDiagnoseGraphOutput = {
    url: string;
    summary: string;
    detect?: BrowserDetectResult;
    grep?: BrowserGrepResult;
    diagnose?: BrowserDiagnoseResult;
    errors: string[];
};