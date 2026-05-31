import { ChatDeepSeek } from '@langchain/deepseek';
// import { llmSvc } from '../db/index.js';
import { env } from '../env.js';

let deepSeekChat: ChatDeepSeek | null;

export async function LlmDeepSeek() {
    if (deepSeekChat) return deepSeekChat;

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

    deepSeekChat = new ChatDeepSeek({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.DEEPSEEK_MODEL,
        temperature: 0,
        maxTokens: 10000,
    });

    return deepSeekChat;
}
