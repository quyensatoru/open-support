import { Bot, Cpu, Gauge } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { agentApi } from '../api/client';
import type { HealthResponse } from '../api/types';
import { DashboardPage } from '../pages/DashboardPage';

type PageKey = 'dashboard';

const NAV_ITEMS: Array<{ key: PageKey; label: string; icon: typeof Gauge }> = [
    { key: 'dashboard', label: 'Dashboard', icon: Gauge },
];

export function App() {
    const [activePage, setActivePage] = useState<PageKey>('dashboard');
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const nextHealth = await agentApi.health();
            setHealth(nextHealth);
        } catch (requestError) {
            setError(
                requestError instanceof Error ? requestError.message : 'Unable to load agent data',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const page = useMemo(() => {
        switch (activePage) {
            case 'dashboard':
                return <DashboardPage health={health} />;
        }
    }, [activePage, health]);

    return (
        <div className="admin-shell">
            <aside className="sidebar" aria-label="Primary navigation">
                <div className="brand">
                    <Bot size={22} />
                    <div>
                        <strong>MIDA Agent</strong>
                        <span>Admin</span>
                    </div>
                </div>
                <nav>
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.key}
                                className={activePage === item.key ? 'active' : undefined}
                                type="button"
                                onClick={() => setActivePage(item.key)}
                            >
                                <Icon size={16} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <main className="main-surface">
                <header className="topbar">
                    <div>
                        <span className="eyebrow">Internal runtime</span>
                        <strong>{health?.name ?? 'mida-agent'}</strong>
                    </div>
                    <div className="topbar-status">
                        <Cpu size={16} />
                        {loading ? 'syncing' : (health?.status ?? 'offline')}
                    </div>
                </header>

                {error && <div className="error-banner">Agent API unavailable: {error}</div>}
                {page}
            </main>
        </div>
    );
}
