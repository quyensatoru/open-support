import type { AgentRun } from '../api/types';
import { formatDateTime } from '../lib/format';

type LogsPageProps = {
    runs: AgentRun[];
};

export function LogsPage({ runs }: LogsPageProps) {
    return (
        <section className="page-stack" aria-label="Logs">
            <div className="section-heading">
                <h1>Logs</h1>
                <p>Run-derived activity log for the scaffold runtime.</p>
            </div>

            <div className="log-list">
                {runs.map((run) => (
                    <div className="log-line" key={run.id}>
                        <time>{formatDateTime(run.updatedAt)}</time>
                        <span>{run.status}</span>
                        <p>{run.error ?? run.input.message}</p>
                    </div>
                ))}
                {runs.length === 0 && <div className="empty-state">No runtime activity yet.</div>}
            </div>
        </section>
    );
}
