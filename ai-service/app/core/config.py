from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')
    ai_database_path: str = '../data/ai.sqlite'
    image_storage_dir: str = '../data/spam-images'
    max_image_size_mb: int = 8
    spam_auto_delete_threshold: float = 0.97
    spam_review_threshold: float = 0.90
    phash_max_distance: int = 10
    dinov2_model_name: str = 'facebook/dinov2-small'
    ai_worker_concurrency: int = 1
    ai_service_port: int = 8000
settings = Settings()
