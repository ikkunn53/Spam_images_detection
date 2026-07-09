import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';

export const db = new Database(config.databasePath);
const schemaPath = path.join(process.cwd(), 'src/repositories/schema.sql');
const fallbackSchemaPath = path.join(process.cwd(), 'discord-bot/src/repositories/schema.sql');
const schema = fs.readFileSync(fs.existsSync(schemaPath) ? schemaPath : fallbackSchemaPath, 'utf8');
db.exec(schema);
