import type { AgentSettings } from '../api/types';

type SettingsPageProps = {
    settings: AgentSettings | null;
};

export function SettingsPage({ settings }: SettingsPageProps) {
    return (
        <section className="page-stack" aria-label="Settings">
            <div className="section-heading">
                <h1>Settings</h1>
                <p>Read-only runtime configuration surfaced by the agent server.</p>
            </div>

            <div className="content-panel">
                <dl className="detail-grid">
                    <div>
                        <dt>OpenAI model</dt>
                        <dd>{settings?.model ?? 'not loaded'}</dd>
                    </div>
                    <div>
                        <dt>OpenAI key</dt>
                        <dd>{settings?.openAiConfigured ? 'configured' : 'not configured'}</dd>
                    </div>
                    <div>
                        <dt>LangSmith tracing</dt>
                        <dd>{settings?.langSmithTracing ? 'enabled' : 'disabled'}</dd>
                    </div>
                    <div>
                        <dt>Playwright headless</dt>
                        <dd>{settings?.playwrightHeadless ? 'true' : 'false'}</dd>
                    </div>
                    <div>
                        <dt>MCP server</dt>
                        <dd>{settings?.mcpStatus ?? 'placeholder'}</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
