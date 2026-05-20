import type { SkillDefinition } from '../api/types';

type SkillsPageProps = {
    skills: SkillDefinition[];
};

export function SkillsPage({ skills }: SkillsPageProps) {
    return (
        <section className="page-stack" aria-label="Skills">
            <div className="section-heading">
                <h1>Skills</h1>
                <p>Typed skill manifests available to the internal agent runtime.</p>
            </div>

            <div className="skill-list">
                {skills.map((skill) => (
                    <article className="skill-item" key={skill.id}>
                        <div>
                            <h2>{skill.name}</h2>
                            <p>{skill.description}</p>
                        </div>
                        <div className="skill-meta">
                            <span>{skill.enabled ? 'enabled' : 'disabled'}</span>
                            <code>{skill.id}</code>
                        </div>
                        <pre>{skill.instructions}</pre>
                        <div className="chip-row">
                            {skill.toolIds.map((toolId) => (
                                <span className="chip" key={toolId}>
                                    {toolId}
                                </span>
                            ))}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
