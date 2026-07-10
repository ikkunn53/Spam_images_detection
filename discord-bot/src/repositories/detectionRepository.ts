import { db } from './database.js';
export class DetectionRepository {
  create(input: Record<string, unknown>): number {
    const stmt = db.prepare(`INSERT INTO detection_events (guild_id, channel_id, message_id, user_id, sha256, decision_method, confidence_level, phash_distance, ai_similarity, matched_spam_image_id, final_decision, auto_deleted, metadata_json) VALUES (@guild_id, @channel_id, @message_id, @user_id, @sha256, @decision_method, @confidence_level, @phash_distance, @ai_similarity, @matched_spam_image_id, @final_decision, @auto_deleted, @metadata_json)`);
    return Number(stmt.run(input).lastInsertRowid);
  }
  addModerationAction(detectionEventId: number, action: string, actorUserId: string, notes?: string): void {
    db.prepare('INSERT INTO moderation_actions (detection_event_id, action, actor_user_id, notes) VALUES (?, ?, ?, ?)').run(detectionEventId, action, actorUserId, notes ?? null);
    if (action === 'false_positive') {
      const event = db.prepare('SELECT guild_id, sha256 FROM detection_events WHERE id = ?').get(detectionEventId) as { guild_id: string; sha256?: string } | undefined;
      if (event) db.prepare('INSERT INTO false_positive_reports (detection_event_id, guild_id, sha256, actor_user_id) VALUES (?, ?, ?, ?)').run(detectionEventId, event.guild_id, event.sha256 ?? null, actorUserId);
    }
  }
}
