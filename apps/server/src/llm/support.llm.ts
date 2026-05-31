import { ChatOpenAI, type ChatOpenAICallOptions } from '@langchain/openai';

import { env } from '../env.js';

let supportReasoningChat: ChatOpenAI<ChatOpenAICallOptions> | null = null;

export function supportReasoningModelName(): string {
    return env.SUPPORT_OPENAI_MODEL.trim() || env.OPENAI_MODEL;
}

function isReasoningModel(model: string): boolean {
    return /^(gpt-5|o[134])(?:[-.]|$)/i.test(model.trim());
}

export async function LlmSupportReasoning(): Promise<ChatOpenAI<ChatOpenAICallOptions>> {
    if (supportReasoningChat) return supportReasoningChat;

    const model = supportReasoningModelName();
    supportReasoningChat = new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model,
        ...(!isReasoningModel(model) ? { temperature: 0 } : {}),
        maxTokens: 10000,
        ...(isReasoningModel(model)
            ? {
                  reasoning: {
                      effort: 'high',
                      summary: 'auto',
                  },
              }
            : {}),
    });

    return supportReasoningChat;
}
