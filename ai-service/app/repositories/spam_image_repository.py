import json
from app.repositories.database import conn
class SpamImageRepository:
    def find_active(self):
        rows = conn.execute('SELECT * FROM spam_images WHERE active = 1').fetchall()
        return [dict(r) for r in rows]
    def find_by_sha256(self, sha256: str):
        row = conn.execute('SELECT * FROM spam_images WHERE sha256 = ?', (sha256,)).fetchone()
        return dict(row) if row else None
    def create(self, data: dict) -> int:
        cur = conn.execute('''INSERT INTO spam_images (guild_id, sha256, phash, embedding_json, image_path, category, notes, registered_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', (data.get('guild_id'), data['sha256'], data['phash'], json.dumps(data['embedding']), data.get('image_path'), data.get('category'), data.get('notes'), data.get('registered_by_user_id')))
        conn.commit()
        return int(cur.lastrowid)
