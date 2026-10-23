import asyncio
import time
from PIL import Image
from app.services import image_features


def test_inference_does_not_block_http_event_loop(monkeypatch):
    events = []
    def slow_inference(_image):
        events.append('started')
        time.sleep(0.15)
        events.append('finished')
        return [1.0]
    monkeypatch.setattr(image_features, '_embedding_sync', slow_inference)
    async def run():
        monkeypatch.setattr(image_features, '_model_lock', asyncio.Lock())
        task = asyncio.create_task(image_features.embedding(Image.new('RGB', (2, 2))))
        await asyncio.sleep(0.03)
        assert 'finished' not in events
        assert await task == [1.0]
    asyncio.run(run())
