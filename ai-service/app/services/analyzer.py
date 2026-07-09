from app.core.config import settings
from app.repositories.spam_image_repository import SpamImageRepository
from app.services.image_features import load_image, sha256, phash, hamming, embedding, cosine

class Analyzer:
    def __init__(self, repo: SpamImageRepository | None = None):
        self.repo = repo or SpamImageRepository()

    async def analyze(self, data: bytes, provided_sha: str | None = None):
        img = load_image(data)
        digest = provided_sha or sha256(data)
        current_phash = phash(img)
        rows = self.repo.find_active()
        if not rows:
            return self._result(False, 'allow', 'low', 'none', False, None, None, None)

        for row in rows:
            if row['sha256'] == digest:
                return self._result(True, 'delete', 'high', 'sha256', True, 0, None, row['id'])

        best_phash = None
        best_row = None
        for row in rows:
            if row.get('phash'):
                try:
                    dist = hamming(current_phash, row['phash'])
                except ValueError:
                    continue
                if best_phash is None or dist < best_phash:
                    best_phash, best_row = dist, row
        if best_phash is not None and best_phash <= settings.phash_max_distance:
            return self._result(True, 'delete', 'high', 'phash', False, best_phash, None, best_row['id'])

        rows_with_embeddings = [row for row in rows if row.get('embedding_json')]
        if not rows_with_embeddings:
            return self._result(False, 'allow', 'low', 'none', False, best_phash, None, None)

        emb = await embedding(img)
        best_similarity = 0.0
        best_embedding_row = None
        for row in rows_with_embeddings:
            sim = cosine(emb, row['embedding_json'])
            if sim > best_similarity:
                best_similarity, best_embedding_row = sim, row
        if best_embedding_row and best_similarity >= settings.spam_auto_delete_threshold:
            return self._result(True, 'delete', 'high', 'dinov2', False, best_phash, best_similarity, best_embedding_row['id'])
        if best_embedding_row and best_similarity >= settings.spam_review_threshold:
            return self._result(True, 'review', 'medium', 'dinov2', False, best_phash, best_similarity, best_embedding_row['id'])
        return self._result(False, 'allow', 'low', 'none', False, best_phash, best_similarity if best_embedding_row else None, best_embedding_row['id'] if best_embedding_row else None)

    def _result(self, is_spam, action, confidence, method, sha_match, phash_distance, ai_similarity, match_id):
        return {'is_spam': is_spam, 'action': action, 'confidence_level': confidence, 'decision_method': method, 'sha256_match': sha_match, 'phash_distance': phash_distance, 'ai_similarity': ai_similarity, 'matched_spam_image_id': match_id}
