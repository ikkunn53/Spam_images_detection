CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  log_channel_id TEXT,
  auto_delete_enabled INTEGER NOT NULL DEFAULT 1,
  review_enabled INTEGER NOT NULL DEFAULT 1,
  review_delete_on_medium INTEGER NOT NULL DEFAULT 0,
  spam_auto_delete_threshold REAL,
  spam_review_threshold REAL,
  phash_max_distance INTEGER,
  admin_role_id TEXT,
  use_global_spam_db INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS spam_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  sha256 TEXT NOT NULL UNIQUE,
  phash TEXT,
  embedding_json TEXT,
  image_path TEXT,
  category TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  registered_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS detection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sha256 TEXT,
  decision_method TEXT,
  confidence_level TEXT,
  phash_distance INTEGER,
  ai_similarity REAL,
  matched_spam_image_id INTEGER,
  final_decision TEXT NOT NULL,
  auto_deleted INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS detection_events_guild_user_created_at_idx
  ON detection_events (guild_id, user_id, created_at);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detection_event_id INTEGER,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS false_positive_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detection_event_id INTEGER,
  guild_id TEXT NOT NULL,
  sha256 TEXT,
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
