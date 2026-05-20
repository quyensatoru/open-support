import { PlayIcon, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import type { AgentRun } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime, stringifyOutput } from '../lib/format';

type RunsPageProps = {
    runs: AgentRun[];
    loading: boolean;
    onRefresh: () => void;
    onCreateRun: (message: string) => Promise<void>;
};

export function RunsPage({ runs, loading, onRefresh, onCreateRun }: RunsPageProps) {
    const [message, setMessage] = useState('Check agent runtime status');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        try {
            await onCreateRun(message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="page-stack" aria-label="Runs">
            <div className="section-heading section-heading--with-action">
                <div>
                    <h1>Runs</h1>
                    <p>Create and inspect internal agent runs.</p>
                </div>
                <button
                    className="icon-button"
                    type="button"
                    onClick={onRefresh}
                    aria-label="Refresh runs"
                >
                    <RefreshCw size={16} className={loading ? 'spin' : undefined} />
                </button>
            </div>

            <form className="run-form" onSubmit={handleSubmit}>
                <label htmlFor="run-message">Message</label>
                <div className="run-form-row">
                    <input
                        id="run-message"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Ask the agent to run a scaffold check"
                    />
                    <button type="submit" disabled={submitting || !message.trim()}>
                        <PlayIcon size={16} />
                        Run
                    </button>
                </div>
            </form>

            <div className="table-panel">
                <table>
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Message</th>
                            <th>Output</th>
                            <th>Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((run) => (
                            <tr key={run.id}>
                                <td>
                                    <StatusBadge status={run.status} />
                                </td>
                                <td>{run.input.message}</td>
                                <td>
                                    <pre>{stringifyOutput(run.output)}</pre>
                                </td>
                                <td>{formatDateTime(run.updatedAt)}</td>
                            </tr>
                        ))}
                        {runs.length === 0 && (
                            <tr>
                                <td colSpan={4}>No runs yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
