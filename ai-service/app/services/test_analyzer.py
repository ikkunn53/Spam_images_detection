import asyncio
from app.services import analyzer as analyzer_module
from app.services.analyzer import Analyzer

class Repo:
    def __init__(self, rows):
        self.rows = rows
    def find_active(self):
        return self.rows

def run(coro):
    return asyncio.run(coro)

def patch_common(monkeypatch):
    monkeypatch.setattr(analyzer_module, 'load_image', lambda data: object())
    monkeypatch.setattr(analyzer_module, 'sha256', lambda data: 'posted-sha')
    monkeypatch.setattr(analyzer_module, 'phash', lambda img: 'posted-phash')

def test_empty_database_allows_without_embedding(monkeypatch):
    patch_common(monkeypatch)
    async def fail_embedding(_img):
        raise AssertionError('embedding should not be called when no spam images exist')
    monkeypatch.setattr(analyzer_module, 'embedding', fail_embedding)

    result = run(Analyzer(Repo([])).analyze(b'image'))

    assert result['action'] == 'allow'
    assert result['decision_method'] == 'none'
    assert result['ai_similarity'] is None

def test_sha_match_deletes_without_embedding(monkeypatch):
    patch_common(monkeypatch)
    async def fail_embedding(_img):
        raise AssertionError('embedding should not be called on sha match')
    monkeypatch.setattr(analyzer_module, 'embedding', fail_embedding)

    result = run(Analyzer(Repo([{'id': 10, 'sha256': 'posted-sha', 'phash': 'other'}])).analyze(b'image'))

    assert result['action'] == 'delete'
    assert result['decision_method'] == 'sha256'
    assert result['matched_spam_image_id'] == 10
    assert result['matched_spam_image_sha256'] == 'posted-sha'
    assert result['matched_spam_image_phash'] == 'other'

def test_phash_match_deletes_without_embedding(monkeypatch):
    patch_common(monkeypatch)
    monkeypatch.setattr(analyzer_module, 'hamming', lambda _a, _b: 2)
    async def fail_embedding(_img):
        raise AssertionError('embedding should not be called on pHash match')
    monkeypatch.setattr(analyzer_module, 'embedding', fail_embedding)

    result = run(Analyzer(Repo([{'id': 20, 'sha256': 'different', 'phash': 'known-phash'}])).analyze(b'image'))

    assert result['action'] == 'delete'
    assert result['decision_method'] == 'phash'
    assert result['phash_distance'] == 2
    assert result['matched_spam_image_id'] == 20
    assert result['matched_spam_image_sha256'] == 'different'
    assert result['matched_spam_image_phash'] == 'known-phash'
