# 運用メモ

## 閾値調整

DINOv2 Cosine Similarity の閾値は絶対的な正解ではありません。実際のスパム画像、加工画像、正常画像を収集し、`SPAM_AUTO_DELETE_THRESHOLD` と `SPAM_REVIEW_THRESHOLD` を段階的に調整してください。

## 障害時 Fallback

AI Service が停止しても Bot は停止しません。Bot 側の SHA-256 完全一致は継続し、AI Service 連続失敗時は一時的に Circuit Breaker を開いて無限 Retry を避けます。
