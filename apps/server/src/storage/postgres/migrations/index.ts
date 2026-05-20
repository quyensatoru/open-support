import { createConfigTablesMigration } from './001_create_config_tables.js';
import type { PostgresMigration } from './types.js';

export const postgresMigrations = [createConfigTablesMigration] satisfies PostgresMigration[];
