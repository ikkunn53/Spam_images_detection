import { config } from '../config/env.js';
import { db } from './database.js';
export type GuildSettings = { guild_id: string; log_channel_id?: string; auto_delete_enabled: number; review_enabled: number; review_delete_on_medium: number; spam_auto_delete_threshold?: number; spam_review_threshold?: number; phash_max_distance?: number; admin_role_id?: string };
export class GuildSettingsRepository {
  get(guildId: string): GuildSettings {
    const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) as GuildSettings | undefined;
    return row ?? { guild_id: guildId, auto_delete_enabled: 1, review_enabled: 1, review_delete_on_medium: config.reviewDeleteOnMedium ? 1 : 0 };
  }
}
