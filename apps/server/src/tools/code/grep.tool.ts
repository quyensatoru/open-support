import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../observability/logger.js';

export const searchTool = tool(
    () => {
        try {
            // TO DO
        } catch (error: unknown) {
            if (error instanceof Error) {
                logger.error(error.message);
            }

            logger.error('Search codebase error');
        }
    },
    {
        name: 'code.search',
        description: 'Search issue on codebase',
        schema: z.object({
            issue: z.string().describe('describe issue'),
            metadata: z.object().optional(),
        }),
    },
);
