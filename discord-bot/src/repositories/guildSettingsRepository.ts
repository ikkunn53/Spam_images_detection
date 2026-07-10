import { config } from '../config/env.js';
import { db } from './database.js';
export type GuildSettings = { guild_id: string; log_channel_id?: string; auto_delete_enabled: number; review_enabled: number; review_delete_on_medium: number; spam_auto_delete_threshold?: number; spam_review_threshold?: number; phash_max_distance?: number; admin_role_id?: string };
export class GuildSettingsRepository {
  get(guildId: string): GuildSettings {
    const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) as GuildSettings | undefined;
    return row ?? { guild_id: guildId, auto_delete_enabled: 1, review_enabled: 1, review_delete_on_medium: config.reviewDeleteOnMedium ? 1 : 0 };
  }

  setLogChannel(guildId: string, logChannelId: string | null): void {
    db.prepare(`INSERT INTO guild_settings (guild_id, log_channel_id, auto_delete_enabled, review_enabled, review_delete_on_medium)
      VALUES (@guild_id, @log_channel_id, 1, 1, @review_delete_on_medium)
      ON CONFLICT(guild_id) DO UPDATE SET log_channel_id = excluded.log_channel_id, updated_at = CURRENT_TIMESTAMP`)
      .run({ guild_id: guildId, log_channel_id: logChannelId, review_delete_on_medium: config.reviewDeleteOnMedium ? 1 : 0 });
  }
}
