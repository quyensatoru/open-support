import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export enum BrowserSignalDevtool {
    Script = 'script',
    Network = 'network',
    Dom = 'dom',
    Console = 'console',
    Storage = 'storage',
    Cookie = 'cookie',
    Content = 'content',
    Application = 'application',
}

export const detectKeyword = tool(async () => {}, {
    name: 'detect.keyword',
    schema: z.object({
        appName: z.string().describe('App name'),
        signal: z
            .enum(BrowserSignalDevtool)
            .describe('Describe tab track on devtool browser')
            .default(BrowserSignalDevtool.Dom),
    }),
});
