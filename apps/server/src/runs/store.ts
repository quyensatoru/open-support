import { randomUUID } from 'node:crypto';

import type { AgentRun, AgentRunRequest, AgentRunStatus } from '../http/contracts.js';

const ALLOWED_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
    queued: ['running', 'failed'],
    running: ['completed', 'failed'],
    completed: [],
    failed: [],
};

export class RunStore {
    private readonly runs = new Map<string, AgentRun>();

    create(input: AgentRunRequest): AgentRun {
        const now = new Date().toISOString();
        const run: AgentRun = {
            id: randomUUID(),
            status: 'queued',
            input,
            createdAt: now,
            updatedAt: now,
        };
        this.runs.set(run.id, run);
        return run;
    }

    list(): AgentRun[] {
        return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    get(id: string): AgentRun | undefined {
        return this.runs.get(id);
    }

    transition(id: string, status: AgentRunStatus, patch: Partial<AgentRun> = {}): AgentRun {
        const current = this.runs.get(id);
        if (!current) {
            throw new Error(`Run not found: ${id}`);
        }

        if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
            throw new Error(`Invalid run status transition: ${current.status} -> ${status}`);
        }

        const next: AgentRun = {
            ...current,
            ...patch,
            status,
            updatedAt: new Date().toISOString(),
        };
        this.runs.set(id, next);
        return next;
    }

    reset(): void {
        this.runs.clear();
    }
}

export const runStore = new RunStore();
