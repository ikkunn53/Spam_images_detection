CREATE TABLE IF NOT EXISTS spam_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  sha256 TEXT NOT NULL UNIQUE,
  phash TEXT,
  embedding_json TEXT NOT NULL,
  image_path TEXT,
  category TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  registered_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
