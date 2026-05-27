import { ChatOpenRouter } from '@langchain/openrouter';
// import { llmSvc } from '../db/index.js';
import { env } from '../env.js';

let openRouterChat: ChatOpenRouter | null;

export async function LlmOpenRouter() {
    if (openRouterChat) return openRouterChat;

    // const llm = await llmSvc.find('openai');

    // if (!llm) {
    //     throw new Error('llm config not found');
    // }

    // openRouterChat = new ChatOpenRouter({
    //     apiKey: llm.apiKey,
    //     model: llm.model,
    //     temperature: llm.temp,
    //     maxTokens: llm.maxTokens || 10000,
    // });

    openRouterChat = new ChatOpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
        temperature: 0,
        maxTokens: 10000,
    });

    return openRouterChat;
}
