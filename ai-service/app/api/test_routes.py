import asyncio
import io
import sqlite3
from pathlib import Path
import httpx
from PIL import Image
from app.api import routes
from app.core.config import settings
from app.main import app
from app.repositories import spam_image_repository


def test_authenticated_registration_and_image_lifecycle(monkeypatch, tmp_path):
    conn = sqlite3.connect(':memory:', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(Path(spam_image_repository.__file__).with_name('schema.sql').read_text())
    monkeypatch.setattr(spam_image_repository, 'conn', conn)
    monkeypatch.setattr(settings, 'admin_web_token', 'test-only')
    monkeypatch.setattr(settings, 'image_storage_dir', str(tmp_path))
    async def fake_embedding(_image):
        return [1.0, 0.0]
    monkeypatch.setattr(routes, 'embedding', fake_embedding)
    image = io.BytesIO()
    Image.new('RGB', (16, 16), 'blue').save(image, format='PNG')
    upload = {'file': ('test.png', image.getvalue(), 'image/png')}
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.post('/v1/spam-images', files=upload)).status_code == 401
            assert conn.execute('SELECT COUNT(*) FROM spam_images').fetchone()[0] == 0
            headers = {'x-admin-token': 'test-only'}
            result = await client.post('/v1/spam-images', files=upload, headers=headers)
            assert result.status_code == 200
            image_id = result.json()['spam_image_id']
            assert (await client.post('/v1/spam-images', files=upload, headers=headers)).json()['already_exists']
            assert (await client.get(f'/v1/spam-images/{image_id}/image')).status_code == 401
            assert (await client.get(f'/v1/spam-images/{image_id}/image', headers=headers)).content == image.getvalue()
            assert (await client.get('/v1/admin/spam-images')).status_code == 401
            assert (await client.get('/v1/admin/spam-images', params={'token': 'test-only'})).status_code == 200
            assert (await client.get(f'/v1/spam-images/{image_id}/image')).status_code == 200
            assert (await client.post('/v1/analyze', files=upload)).json()['action'] == 'delete'
            assert (await client.post(f'/v1/admin/spam-images/{image_id}/delete')).status_code == 303
            assert (await client.post('/v1/analyze', files=upload)).json()['action'] == 'allow'
            assert (await client.post(f'/v1/admin/spam-images/{image_id}/delete-permanent')).status_code == 303
            assert not list(tmp_path.iterdir())
            assert (await client.get(f'/v1/spam-images/{image_id}/image')).status_code == 404
            assert (await client.post('/v1/admin/spam-images', files=upload)).status_code == 303
    try:
        asyncio.run(run())
    finally:
        conn.close()
