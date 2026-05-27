import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';

import { logger } from '../../../../observability/logger.js';

type TokenUsage = {
    promptTokens?: number | undefined;
    completionTokens?: number | undefined;
    totalTokens?: number | undefined;
    cachedTokens?: number | undefined;
    reasoningTokens?: number | undefined;
    model?: string | undefined;
};

type TokenUsageTotals = {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
};

const totals: TokenUsageTotals = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberField(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }

    return undefined;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value;
    }

    return undefined;
}

function usageFromRecord(record: Record<string, unknown>): TokenUsage {
    const promptDetails = isRecord(record.prompt_tokens_details)
        ? record.prompt_tokens_details
        : isRecord(record.input_token_details)
          ? record.input_token_details
          : {};
    const completionDetails = isRecord(record.completion_tokens_details)
        ? record.completion_tokens_details
        : isRecord(record.output_token_details)
          ? record.output_token_details
          : {};

    return {
        promptTokens: numberField(record, [
            'promptTokens',
            'prompt_tokens',
            'inputTokens',
            'input_tokens',
        ]),
        completionTokens: numberField(record, [
            'completionTokens',
            'completion_tokens',
            'outputTokens',
            'output_tokens',
        ]),
        totalTokens: numberField(record, ['totalTokens', 'total_tokens']),
        cachedTokens: numberField(promptDetails, ['cached_tokens', 'cache_read']),
        reasoningTokens: numberField(completionDetails, ['reasoning_tokens']),
        model: stringField(record, ['model', 'model_name', 'modelName']),
    };
}

function mergeUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
    return {
        promptTokens: left.promptTokens ?? right.promptTokens,
        completionTokens: left.completionTokens ?? right.completionTokens,
        totalTokens: left.totalTokens ?? right.totalTokens,
        cachedTokens: left.cachedTokens ?? right.cachedTokens,
        reasoningTokens: left.reasoningTokens ?? right.reasoningTokens,
        model: left.model ?? right.model,
    };
}

function nestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = record[key];
    return isRecord(value) ? value : undefined;
}

function candidateRecords(output: LLMResult): Record<string, unknown>[] {
    const records: Record<string, unknown>[] = [];

    if (isRecord(output.llmOutput)) {
        records.push(output.llmOutput);

        for (const key of ['tokenUsage', 'token_usage', 'estimatedTokenUsage', 'usage']) {
            const nested = nestedRecord(output.llmOutput, key);
            if (nested) records.push(nested);
        }
    }

    for (const generations of output.generations) {
        for (const generation of generations) {
            if (isRecord(generation.generationInfo)) {
                records.push(generation.generationInfo);

                for (const key of ['tokenUsage', 'token_usage', 'usage', 'usage_metadata']) {
                    const nested = nestedRecord(generation.generationInfo, key);
                    if (nested) records.push(nested);
                }
            }

            if ('message' in generation && isRecord(generation.message)) {
                const usageMetadata = nestedRecord(generation.message, 'usage_metadata');
                const responseMetadata = nestedRecord(generation.message, 'response_metadata');
                if (usageMetadata) records.push(usageMetadata);
                if (responseMetadata) {
                    records.push(responseMetadata);

                    for (const key of ['tokenUsage', 'token_usage', 'usage', 'usage_metadata']) {
                        const nested = nestedRecord(responseMetadata, key);
                        if (nested) records.push(nested);
                    }
                }
            }
        }
    }

    return records;
}

function usageFromResult(output: LLMResult): TokenUsage {
    let usage: TokenUsage = {};

    for (const record of candidateRecords(output)) {
        usage = mergeUsage(usage, usageFromRecord(record));
    }

    if (
        usage.totalTokens === undefined &&
        usage.promptTokens !== undefined &&
        usage.completionTokens !== undefined
    ) {
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
    }

    return usage;
}

function addUsageToTotals(usage: TokenUsage): void {
    totals.calls += 1;
    totals.promptTokens += usage.promptTokens ?? 0;
    totals.completionTokens += usage.completionTokens ?? 0;
    totals.totalTokens += usage.totalTokens ?? 0;
    totals.cachedTokens += usage.cachedTokens ?? 0;
    totals.reasoningTokens += usage.reasoningTokens ?? 0;
}

export function resetDatabaseLLMTokenUsageTotals(): void {
    totals.calls = 0;
    totals.promptTokens = 0;
    totals.completionTokens = 0;
    totals.totalTokens = 0;
    totals.cachedTokens = 0;
    totals.reasoningTokens = 0;
}

export function getDatabaseLLMTokenUsageTotals(): TokenUsageTotals {
    return { ...totals };
}

export function createDatabaseLLMTokenUsageCallback(step: string): BaseCallbackHandler {
    return BaseCallbackHandler.fromMethods({
        handleLLMEnd(output) {
            const usage = usageFromResult(output);

            if (
                usage.promptTokens === undefined &&
                usage.completionTokens === undefined &&
                usage.totalTokens === undefined
            ) {
                logger.debug({ step }, 'database.llm token usage unavailable');
                return;
            }

            addUsageToTotals(usage);

            logger.info(
                {
                    step,
                    model: usage.model,
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens,
                    cachedTokens: usage.cachedTokens,
                    reasoningTokens: usage.reasoningTokens,
                },
                'database.llm token usage',
            );
        },
        handleLLMError(error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn({ step, error: message }, 'database.llm failed before token usage was available');
        },
    });
}
