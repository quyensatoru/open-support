import { ChatOpenAI, ChatOpenAICallOptions } from '@langchain/openai';
import { llmSvc } from '../db/index.js';
import { env } from '../env.js';

let openAIChat: ChatOpenAI<ChatOpenAICallOptions> | null;

export async function LlmOpenAI() {
    if (openAIChat) return openAIChat;

    // const llm = await llmSvc.find('openai');

    // if (!llm) {
    //     throw new Error('llm config not found');
    // }

    // openAIChat = new ChatOpenAI({
    //     apiKey: llm.apiKey,
    //     model: llm.model,
    //     temperature: llm.temp,
    //     maxTokens: llm.maxTokens || 10000,
    // });

    openAIChat = new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        maxTokens: 10000,
    });

    return openAIChat;
}
