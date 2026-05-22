import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { invokeBrowserDiagnoseGraph } from '../../graph/brower-diagnose.graph.js';

export const browserDiagnose = tool(
    async ({ url, app }) => {
        const result = await invokeBrowserDiagnoseGraph({
            url,
            app,
        });

        return JSON.stringify(result); // agent đọc text
    },
    {
        name: 'browser_diagnose',
        description: `
Diagnose a website (Shopify storefront) to detect issues like:
- missing tracking script
- API not firing
- DOM element not found
- performance issues

Use this when user asks about website problems or tracking issues.
`,
        schema: z.object({
            url: z.string().describe('Website URL to diagnose'),
            app: z.string().describe('Name app'),
        }),
    },
);
