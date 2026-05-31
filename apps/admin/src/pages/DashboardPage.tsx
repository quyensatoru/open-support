import { Bot, Database, PlugZap } from 'lucide-react';

import type { HealthResponse } from '../api/types';

type DashboardPageProps = {
    health: HealthResponse | null;
};

export function DashboardPage({ health }: DashboardPageProps) {
    return (
        <section className="page-stack" aria-label="Dashboard">
            <div className="section-heading">
                <h1>Config Runtime</h1>
                <p>Server and database status for DB-backed config APIs.</p>
            </div>

            <div className="metric-grid">
                <div className="metric-card">
                    <Bot size={20} />
                    <span>Server</span>
                    <strong>{health?.status ?? 'offline'}</strong>
                </div>
                <div className="metric-card">
                    <Database size={20} />
                    <span>Database</span>
                    <strong>{health?.db.status ?? 'unknown'}</strong>
                </div>
                <div className="metric-card">
                    <PlugZap size={20} />
                    <span>MCP</span>
                    <strong>{health?.mcpStatus ?? 'placeholder'}</strong>
                </div>
            </div>

            <div className="content-panel">
                <h2>Current Runtime</h2>
                <dl className="detail-grid">
                    <div>
                        <dt>Config DB</dt>
                        <dd>{health?.db.configured ? 'configured' : 'not configured'}</dd>
                    </div>
                    <div>
                        <dt>MCP</dt>
                        <dd>{health?.mcpStatus ?? 'placeholder'}</dd>
                    </div>
                    <div>
                        <dt>Last health check</dt>
                        <dd>{health?.timestamp ?? 'not loaded'}</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
