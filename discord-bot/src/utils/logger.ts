import pino from 'pino';
import { config } from '../config/env.js';
export const logger = pino({ level: config.logLevel, redact: ['discordToken', 'DISCORD_TOKEN', 'authorization'] });
