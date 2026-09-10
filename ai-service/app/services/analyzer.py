import math

from app.core.config import settings
from app.repositories.spam_image_repository import SpamImageRepository
from app.services.image_features import load_image, sha256, phash, hamming, embedding, cosine

class Analyzer:
    def __init__(self, repo: SpamImageRepository | None = None):
        self.repo = repo or SpamImageRepository()

    async def analyze(self, data: bytes, _provided_sha: str | None = None):
        img = load_image(data)
        # The uploaded bytes are the source of truth.  A caller supplied digest is
        # only transport metadata and must never be allowed to turn different
        # bytes into an exact SHA-256 match.
        digest = sha256(data)
        current_phash = phash(img)
        rows = self.repo.find_active()
        if not rows:
            return self._result(False, 'allow', 'low', 'none', False, None, None, None, None, digest)

        for row in rows:
            if row['sha256'] == digest:
                return self._result(True, 'delete', 'high', 'sha256', True, 0, None, row['id'], row, digest)

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
        rows_with_embeddings = [row for row in rows if row.get('embedding_json')]
        if not rows_with_embeddings:
            if best_row and best_phash <= settings.phash_max_distance:
                return self._result(True, 'review', 'medium', 'phash', False, best_phash, None, best_row['id'], best_row, digest)
            return self._result(False, 'allow', 'low', 'none', False, best_phash, None, None, None, digest)

        emb = await embedding(img)
        best_similarity = -1.0
        best_embedding_row = None
        similarities_by_id = {}
        for row in rows_with_embeddings:
            try:
                sim = cosine(emb, row['embedding_json'])
            except (TypeError, ValueError):
                # One damaged legacy row must not make analysis unavailable for
                # every image. It remains eligible for pHash review only.
                continue
            if not math.isfinite(sim):
                continue
            similarities_by_id[row['id']] = sim
            if sim > best_similarity:
                best_similarity, best_embedding_row = sim, row

        # A perceptual hash is deliberately lossy and a semantic embedding can
        # be high for unrelated images.  Auto-delete only when both independent
        # signals agree on the same registered image.  Either signal by itself
        # is sent to review instead of being labelled an exact/safe match.
        phash_row_similarity = similarities_by_id.get(best_row['id']) if best_row else None
        if best_row and best_phash <= settings.phash_max_distance and phash_row_similarity is not None:
            if phash_row_similarity >= settings.spam_auto_delete_threshold:
                return self._result(True, 'delete', 'high', 'phash_dinov2', False, best_phash, phash_row_similarity, best_row['id'], best_row, digest)
            return self._result(True, 'review', 'medium', 'phash', False, best_phash, phash_row_similarity, best_row['id'], best_row, digest)
        if best_row and best_phash <= settings.phash_max_distance:
            return self._result(True, 'review', 'medium', 'phash', False, best_phash, None, best_row['id'], best_row, digest)
        if best_embedding_row and best_similarity >= settings.spam_auto_delete_threshold:
            return self._result(True, 'review', 'medium', 'dinov2', False, best_phash, best_similarity, best_embedding_row['id'], best_embedding_row, digest)
        if best_embedding_row and best_similarity >= settings.spam_review_threshold:
            return self._result(True, 'review', 'medium', 'dinov2', False, best_phash, best_similarity, best_embedding_row['id'], best_embedding_row, digest)
        return self._result(False, 'allow', 'low', 'none', False, best_phash, best_similarity if best_embedding_row else None, best_embedding_row['id'] if best_embedding_row else None, best_embedding_row, digest)

    def _result(self, is_spam, action, confidence, method, sha_match, phash_distance, ai_similarity, match_id, match_row=None, analyzed_sha256=None):
        return {
            'is_spam': is_spam,
            'action': action,
            'confidence_level': confidence,
            'decision_method': method,
            'sha256_match': sha_match,
            'phash_distance': phash_distance,
            'ai_similarity': ai_similarity,
            'matched_spam_image_id': match_id,
            'matched_spam_image_sha256': match_row.get('sha256') if match_row else None,
            'matched_spam_image_phash': match_row.get('phash') if match_row else None,
            'analyzed_image_sha256': analyzed_sha256,
        }
