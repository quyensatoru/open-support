import { Activity, Bot, Cpu, FileText, Gauge, Settings, Shield, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { agentApi } from '../api/client';
import type {
    AgentRun,
    AgentSettings,
    HealthResponse,
    SkillDefinition,
    ToolDefinition,
} from '../api/types';
import { DashboardPage } from '../pages/DashboardPage';
import { LogsPage } from '../pages/LogsPage';
import { RunsPage } from '../pages/RunsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SkillsPage } from '../pages/SkillsPage';
import { ToolsPage } from '../pages/ToolsPage';

type PageKey = 'dashboard' | 'runs' | 'tools' | 'skills' | 'settings' | 'logs';

const NAV_ITEMS: Array<{ key: PageKey; label: string; icon: typeof Gauge }> = [
    { key: 'dashboard', label: 'Dashboard', icon: Gauge },
    { key: 'runs', label: 'Runs', icon: Activity },
    { key: 'tools', label: 'Tools', icon: Wrench },
    { key: 'skills', label: 'Skills', icon: Shield },
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'logs', label: 'Logs', icon: FileText },
];

export function App() {
    const [activePage, setActivePage] = useState<PageKey>('dashboard');
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [settings, setSettings] = useState<AgentSettings | null>(null);
    const [runs, setRuns] = useState<AgentRun[]>([]);
    const [tools, setTools] = useState<ToolDefinition[]>([]);
    const [skills, setSkills] = useState<SkillDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [nextHealth, nextSettings, nextRuns, nextTools, nextSkills] = await Promise.all([
                agentApi.health(),
                agentApi.settings(),
                agentApi.runs(),
                agentApi.tools(),
                agentApi.skills(),
            ]);
            setHealth(nextHealth);
            setSettings(nextSettings);
            setRuns(nextRuns);
            setTools(nextTools);
            setSkills(nextSkills);
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

    async function createRun(message: string) {
        await agentApi.createRun({ message });
        await refresh();
    }

    const page = useMemo(() => {
        switch (activePage) {
            case 'dashboard':
                return (
                    <DashboardPage
                        health={health}
                        runs={runs}
                        tools={tools}
                        skills={skills}
                        settings={settings}
                    />
                );
            case 'runs':
                return (
                    <RunsPage
                        runs={runs}
                        loading={loading}
                        onRefresh={() => void refresh()}
                        onCreateRun={createRun}
                    />
                );
            case 'tools':
                return <ToolsPage tools={tools} />;
            case 'skills':
                return <SkillsPage skills={skills} />;
            case 'settings':
                return <SettingsPage settings={settings} />;
            case 'logs':
                return <LogsPage runs={runs} />;
        }
    }, [activePage, health, loading, refresh, runs, settings, skills, tools]);

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
