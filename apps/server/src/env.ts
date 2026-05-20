import { EnvSchema, loadEnv as parseEnv, type Env } from '@mida-agent/config';
import * as dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'test') {
    dotenv.config({ path: ['.env', '../../.env'], quiet: true });
}

export { EnvSchema, type Env };

function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
    return parseEnv(input);
}

export const env = loadEnv();
