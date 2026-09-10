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

def test_phash_match_requires_review_without_embedding(monkeypatch):
    patch_common(monkeypatch)
    monkeypatch.setattr(analyzer_module, 'hamming', lambda _a, _b: 2)
    async def fail_embedding(_img):
        raise AssertionError('embedding should not be called on pHash match')
    monkeypatch.setattr(analyzer_module, 'embedding', fail_embedding)

    result = run(Analyzer(Repo([{'id': 20, 'sha256': 'different', 'phash': 'known-phash'}])).analyze(b'image'))

    assert result['action'] == 'review'
    assert result['decision_method'] == 'phash'
    assert result['phash_distance'] == 2
    assert result['matched_spam_image_id'] == 20
    assert result['matched_spam_image_sha256'] == 'different'
    assert result['matched_spam_image_phash'] == 'known-phash'

def test_caller_sha_cannot_spoof_an_exact_match(monkeypatch):
    patch_common(monkeypatch)
    monkeypatch.setattr(analyzer_module, 'hamming', lambda _a, _b: 64)

    result = run(Analyzer(Repo([{'id': 30, 'sha256': 'spoofed-sha', 'phash': 'known-phash'}])).analyze(b'image', 'spoofed-sha'))

    assert result['action'] == 'allow'
    assert result['sha256_match'] is False
    assert result['analyzed_image_sha256'] == 'posted-sha'

def test_phash_and_embedding_must_agree_before_auto_delete(monkeypatch):
    patch_common(monkeypatch)
    monkeypatch.setattr(analyzer_module, 'hamming', lambda _a, _b: 2)
    async def fake_embedding(_img):
        return [1.0, 0.0]
    monkeypatch.setattr(analyzer_module, 'embedding', fake_embedding)
    row = {'id': 40, 'sha256': 'different', 'phash': 'known-phash', 'embedding_json': '[1.0, 0.0]'}

    result = run(Analyzer(Repo([row])).analyze(b'image'))

    assert result['action'] == 'delete'
    assert result['decision_method'] == 'phash_dinov2'
    assert result['sha256_match'] is False

def test_high_embedding_similarity_alone_requires_review(monkeypatch):
    patch_common(monkeypatch)
    monkeypatch.setattr(analyzer_module, 'hamming', lambda _a, _b: 64)
    async def fake_embedding(_img):
        return [1.0, 0.0]
    monkeypatch.setattr(analyzer_module, 'embedding', fake_embedding)
    row = {'id': 50, 'sha256': 'different', 'phash': 'known-phash', 'embedding_json': '[1.0, 0.0]'}

    result = run(Analyzer(Repo([row])).analyze(b'image'))

    assert result['action'] == 'review'
    assert result['decision_method'] == 'dinov2'
    assert result['ai_similarity'] == 1.0

def test_corrupt_embedding_row_does_not_break_other_analysis(monkeypatch):
    patch_common(monkeypatch)
    monkeypatch.setattr(analyzer_module, 'hamming', lambda _a, _b: 64)
    async def fake_embedding(_img):
        return [1.0, 0.0]
    monkeypatch.setattr(analyzer_module, 'embedding', fake_embedding)
    rows = [
        {'id': 60, 'sha256': 'corrupt', 'phash': 'known-phash', 'embedding_json': 'not-json'},
        {'id': 61, 'sha256': 'valid', 'phash': 'known-phash', 'embedding_json': '[0.0, 1.0]'},
    ]

    result = run(Analyzer(Repo(rows)).analyze(b'image'))

    assert result['action'] == 'allow'
    assert result['ai_similarity'] == 0.0
