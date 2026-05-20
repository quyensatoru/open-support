import { ChatOpenAI } from '@langchain/openai';

import type { Env } from '../env.js';
import { env } from '../env.js';

export function createChatModel(config: Env = env): ChatOpenAI | null {
    if (!config.OPENAI_API_KEY) {
        return null;
    }

    return new ChatOpenAI({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        temperature: 0,
    });
}
