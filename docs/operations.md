# 運用メモ

## 閾値調整

DINOv2 Cosine Similarity の閾値は絶対的な正解ではありません。実際のスパム画像、加工画像、正常画像を収集し、`SPAM_AUTO_DELETE_THRESHOLD` と `SPAM_REVIEW_THRESHOLD` を段階的に調整してください。

SHA-256 完全一致以外の自動削除には、同じ登録画像に対する pHash と DINOv2 の複合一致が必要です。どちらか一方だけが閾値を満たした場合は管理者レビューとなります。検知ログの「投稿画像SHA-256」と「検知元スパム画像SHA-256」が異なる場合は完全一致ではないため、「判定方式」「pHash距離」「AI類似度」も併せて確認してください。

## 障害時 Fallback

AI Service が停止しても Bot は停止しません。Bot 側の SHA-256 完全一致は継続し、AI Service 連続失敗時は一時的に Circuit Breaker を開いて無限 Retry を避けます。
