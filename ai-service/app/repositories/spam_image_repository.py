import json
from app.repositories.database import conn
class SpamImageRepository:
    def find_active(self):
        rows = conn.execute('SELECT * FROM spam_images WHERE active = 1').fetchall()
        return [dict(r) for r in rows]
    def find_all(self):
        rows = conn.execute('SELECT * FROM spam_images ORDER BY created_at DESC, id DESC').fetchall()
        return [dict(r) for r in rows]
    def find_by_id(self, spam_image_id: int):
        row = conn.execute('SELECT * FROM spam_images WHERE id = ?', (spam_image_id,)).fetchone()
        return dict(row) if row else None
    def find_by_sha256(self, sha256: str):
        row = conn.execute('SELECT * FROM spam_images WHERE sha256 = ?', (sha256,)).fetchone()
        return dict(row) if row else None
    def create(self, data: dict) -> int:
        cur = conn.execute('''INSERT INTO spam_images (guild_id, sha256, phash, embedding_json, image_path, category, notes, registered_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', (data.get('guild_id'), data['sha256'], data['phash'], json.dumps(data['embedding']), data.get('image_path'), data.get('category'), data.get('notes'), data.get('registered_by_user_id')))
        conn.commit()
        return int(cur.lastrowid)

    def deactivate(self, spam_image_id: int) -> bool:
        cur = conn.execute('UPDATE spam_images SET active = 0 WHERE id = ? AND active = 1', (spam_image_id,))
        conn.commit()
        return cur.rowcount > 0

    def update_metadata(self, spam_image_id: int, category: str | None, notes: str | None) -> bool:
        cur = conn.execute('UPDATE spam_images SET category = ?, notes = ? WHERE id = ?', (category, notes, spam_image_id))
        conn.commit()
        return cur.rowcount > 0

    def delete(self, spam_image_id: int) -> bool:
        cur = conn.execute('DELETE FROM spam_images WHERE id = ?', (spam_image_id,))
        conn.commit()
        return cur.rowcount > 0
