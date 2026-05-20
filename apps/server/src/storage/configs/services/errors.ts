export type ConfigResource = 'agent_config' | 'llm_config';

export class ConfigNotFoundError extends Error {
    readonly statusCode = 404;

    constructor(resource: ConfigResource, identifier: string) {
        super(`${resource} not found: ${identifier}`);
        this.name = 'ConfigNotFoundError';
    }
}

export class ConfigReferenceError extends Error {
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = 'ConfigReferenceError';
    }
}
