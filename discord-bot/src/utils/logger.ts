import pino from 'pino';
import { config } from '../config/env.js';
export const logger = pino({ level: config.logLevel, serializers: { error: pino.stdSerializers.err }, redact: ['discordToken', 'DISCORD_TOKEN', 'authorization', 'aiAdminToken', 'ADMIN_WEB_TOKEN', '*.x-admin-token'] });
