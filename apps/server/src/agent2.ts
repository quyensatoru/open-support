import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { invokeCodeGraphStep, resumeCodeGraphStep } from './graph/code/code.graph.js';
import type { CodeGraphRunResult, CodeRepoResume } from './graph/code/code.type.js';

const threadId = 'agent2-code-test';

function parseRepoAnswer(answer: string): CodeRepoResume {
    const trimmed = answer.trim();
    if (!trimmed) return { repoNames: [] };

    try {
        const parsed = JSON.parse(trimmed) as CodeRepoResume;
        return parsed;
    } catch {
        return {
            repoNames: trimmed
                .split(/[,\n]+/)
                .map((repoName) => repoName.trim())
                .filter(Boolean),
        };
    }
}

function interruptQuestion(result: CodeGraphRunResult) {
    if (result.status !== 'interrupted') return '';

    const value = result.interrupts[0]?.value;
    if (value && typeof value === 'object' && 'question' in value) {
        return String(value.question);
    }

    return JSON.stringify(value, null, 2);
}

async function consumeInterrupt(result: CodeGraphRunResult): Promise<CodeGraphRunResult> {
    if (result.status !== 'interrupted') return result;

    const rl = createInterface({ input, output });
    try {
        const answer = await rl.question(
            `${interruptQuestion(result)}\nRepo name(s) hoac JSON resume: `,
        );

        return await resumeCodeGraphStep(result.threadId, parseRepoAnswer(answer));
    } finally {
        rl.close();
    }
}

let result = await invokeCodeGraphStep({
    threadId,
    app: 'mida record',
    issue: 'T cần tìm ra file name của script inject storefront app mida record',
    mode: 'search',
});

while (result.status === 'interrupted') {
    result = await consumeInterrupt(result);
}

console.dir(result.output, { depth: null });
