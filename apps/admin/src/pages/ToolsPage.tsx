import type { ToolDefinition } from '../api/types';

type ToolsPageProps = {
    tools: ToolDefinition[];
};

export function ToolsPage({ tools }: ToolsPageProps) {
    return (
        <section className="page-stack" aria-label="Tools">
            <div className="section-heading">
                <h1>Tools</h1>
                <p>Local, Playwright, and reserved MCP tool definitions.</p>
            </div>

            <div className="table-panel">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Source</th>
                            <th>Enabled</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tools.map((tool) => (
                            <tr key={tool.id}>
                                <td>
                                    <code>{tool.id}</code>
                                </td>
                                <td>{tool.name}</td>
                                <td>{tool.source}</td>
                                <td>{tool.enabled ? 'yes' : 'no'}</td>
                                <td>{tool.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
