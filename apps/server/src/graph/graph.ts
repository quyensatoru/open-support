import type { AgentRunRequest } from '../http/contracts.js';
import {
    invokeSupportGraph,
    type SupportGraphName,
    type SupportGraphOutput,
} from './support/support.graph.js';

function metadataString(input: AgentRunRequest, key: string): string | undefined {
    const value = input.metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function invokeAgentGraph(input: AgentRunRequest): Promise<SupportGraphOutput> {
    const supportInput = {
        app: metadataString(input, 'app') ?? 'Default Shopify App',
        appKey: metadataString(input, 'appKey') ?? 'default-shopify-app',
        issue: input.message,
        mode: 'diagnose' as const,
        maxHypotheses: 4,
        graphOrder: [
            'hypothesisGraph',
            'browserDiagnoseGraph',
            'codeGraph',
            'databaseGraph',
        ] as SupportGraphName[],
        routingPolicy: 'evidence-driven',
        repos: [],
        repoNames: [],
        memories: [],
        metadata: {},
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(metadataString(input, 'storeUrl') ? { storeUrl: metadataString(input, 'storeUrl') } : {}),
        ...(metadataString(input, 'storeDomain')
            ? { storeDomain: metadataString(input, 'storeDomain') }
            : {}),
    };

    return invokeSupportGraph(supportInput);
}
