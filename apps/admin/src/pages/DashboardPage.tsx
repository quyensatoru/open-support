import { Activity, Bot, Cpu, Wrench } from 'lucide-react';

import type {
    AgentRun,
    AgentSettings,
    HealthResponse,
    SkillDefinition,
    ToolDefinition,
} from '../api/types';

type DashboardPageProps = {
    health: HealthResponse | null;
    runs: AgentRun[];
    tools: ToolDefinition[];
    skills: SkillDefinition[];
    settings: AgentSettings | null;
};

export function DashboardPage({ health, runs, tools, skills, settings }: DashboardPageProps) {
    const completedRuns = runs.filter((run) => run.status === 'completed').length;
    const enabledTools = tools.filter((tool) => tool.enabled).length;
    const enabledSkills = skills.filter((skill) => skill.enabled).length;

    return (
        <section className="page-stack" aria-label="Dashboard">
            <div className="section-heading">
                <h1>Agent Dashboard</h1>
                <p>Runtime status and internal agent surface.</p>
            </div>

            <div className="metric-grid">
                <div className="metric-card">
                    <Bot size={20} />
                    <span>Server</span>
                    <strong>{health?.status ?? 'offline'}</strong>
                </div>
                <div className="metric-card">
                    <Activity size={20} />
                    <span>Runs</span>
                    <strong>{runs.length}</strong>
                </div>
                <div className="metric-card">
                    <Wrench size={20} />
                    <span>Enabled tools</span>
                    <strong>
                        {enabledTools}/{tools.length}
                    </strong>
                </div>
                <div className="metric-card">
                    <Cpu size={20} />
                    <span>Enabled skills</span>
                    <strong>
                        {enabledSkills}/{skills.length}
                    </strong>
                </div>
            </div>

            <div className="content-panel">
                <h2>Current Runtime</h2>
                <dl className="detail-grid">
                    <div>
                        <dt>Model</dt>
                        <dd>{settings?.model ?? 'not loaded'}</dd>
                    </div>
                    <div>
                        <dt>OpenAI</dt>
                        <dd>{settings?.openAiConfigured ? 'configured' : 'missing key'}</dd>
                    </div>
                    <div>
                        <dt>MCP</dt>
                        <dd>{settings?.mcpStatus ?? 'placeholder'}</dd>
                    </div>
                    <div>
                        <dt>Completed runs</dt>
                        <dd>{completedRuns}</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
