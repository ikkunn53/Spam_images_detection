import { db } from './database.js';

export type DetectionEvent = { id: number; guild_id: string; channel_id: string; message_id: string; user_id: string; sha256?: string | null; final_decision: string; auto_deleted: number; metadata_json?: string | null };

export class DetectionRepository {
  create(input: Record<string, unknown>): number {
    const stmt = db.prepare(`INSERT INTO detection_events (guild_id, channel_id, message_id, user_id, sha256, decision_method, confidence_level, phash_distance, ai_similarity, matched_spam_image_id, final_decision, auto_deleted, metadata_json) VALUES (@guild_id, @channel_id, @message_id, @user_id, @sha256, @decision_method, @confidence_level, @phash_distance, @ai_similarity, @matched_spam_image_id, @final_decision, @auto_deleted, @metadata_json)`);
    return Number(stmt.run(input).lastInsertRowid);
  }
  findById(detectionEventId: number): DetectionEvent | undefined {
    return db.prepare('SELECT id, guild_id, channel_id, message_id, user_id, sha256, final_decision, auto_deleted, metadata_json FROM detection_events WHERE id = ?').get(detectionEventId) as DetectionEvent | undefined;
  }

  countRecentSpamOrReviewMessages(guildId: string, userId: string, windowMinutes = 10): number {
    const row = db.prepare(`SELECT COUNT(DISTINCT message_id) AS count
      FROM detection_events
      WHERE guild_id = ?
        AND user_id = ?
        AND final_decision IN ('delete', 'review')
        AND created_at >= datetime('now', ?)`)
      .get(guildId, userId, `-${windowMinutes} minutes`) as { count: number };
    return Number(row.count);
  }

  findRecent(limit = 100): Array<Record<string, unknown>> {
    return db.prepare('SELECT * FROM detection_events ORDER BY created_at DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
  }

  findRecentByGuild(guildId: string, limit = 100): Array<Record<string, unknown>> {
    return db.prepare('SELECT * FROM detection_events WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit) as Array<Record<string, unknown>>;
  }

  findFalsePositiveReports(limit = 100): Array<Record<string, unknown>> {
    return db.prepare(`SELECT f.*, d.channel_id, d.message_id, d.user_id, d.final_decision, d.created_at AS detection_created_at
      FROM false_positive_reports f
      LEFT JOIN detection_events d ON d.id = f.detection_event_id
      ORDER BY f.created_at DESC LIMIT ?`).all(limit) as Array<Record<string, unknown>>;
  }

  findFalsePositiveReportsByGuild(guildId: string, limit = 100): Array<Record<string, unknown>> {
    return db.prepare(`SELECT f.*, d.channel_id, d.message_id, d.user_id, d.final_decision, d.created_at AS detection_created_at
      FROM false_positive_reports f
      LEFT JOIN detection_events d ON d.id = f.detection_event_id
      WHERE f.guild_id = ?
      ORDER BY f.created_at DESC LIMIT ?`).all(guildId, limit) as Array<Record<string, unknown>>;
  }

  addModerationAction(detectionEventId: number, action: string, actorUserId: string, notes?: string): void {
    db.prepare('INSERT INTO moderation_actions (detection_event_id, action, actor_user_id, notes) VALUES (?, ?, ?, ?)').run(detectionEventId, action, actorUserId, notes ?? null);
    if (action === 'false_positive') {
      const event = db.prepare('SELECT guild_id, sha256 FROM detection_events WHERE id = ?').get(detectionEventId) as { guild_id: string; sha256?: string } | undefined;
      if (event) db.prepare('INSERT INTO false_positive_reports (detection_event_id, guild_id, sha256, actor_user_id) VALUES (?, ?, ?, ?)').run(detectionEventId, event.guild_id, event.sha256 ?? null, actorUserId);
    }
  }
}
