import { env } from '../env.js';

export function getPlaywrightDefaults() {
    return {
        headless: env.PLAYWRIGHT_HEADLESS,
        timeoutMs: 30_000,
    };
}
