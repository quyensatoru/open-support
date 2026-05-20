import { describe, expect, it } from 'vitest';

import { RunStore } from '../../apps/server/src/runs/store.ts';

describe('run store', () => {
    it('supports queued to running to completed transitions', () => {
        const store = new RunStore();
        const queued = store.create({ message: 'hello' });
        const running = store.transition(queued.id, 'running');
        const completed = store.transition(queued.id, 'completed', { output: { ok: true } });

        expect(running.status).toBe('running');
        expect(completed.status).toBe('completed');
        expect(completed.output).toEqual({ ok: true });
    });

    it('rejects invalid terminal transitions', () => {
        const store = new RunStore();
        const queued = store.create({ message: 'hello' });
        store.transition(queued.id, 'running');
        store.transition(queued.id, 'completed');

        expect(() => store.transition(queued.id, 'running')).toThrow(
            'Invalid run status transition',
        );
    });
});
