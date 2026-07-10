from pathlib import Path
import sqlite3
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from app.core.config import settings
from app.repositories.spam_image_repository import SpamImageRepository
from app.services.analyzer import Analyzer
from app.services.image_features import load_image, sha256, phash, embedding

router = APIRouter(prefix='/v1')
repo = SpamImageRepository()
analyzer = Analyzer(repo)

async def read_limited_upload(file: UploadFile) -> bytes:
    max_bytes = settings.max_image_size_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail='image exceeds size limit')
    return data

def bad_image_error(error: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'invalid or unsupported image: {type(error).__name__}')

@router.post('/analyze')
async def analyze(file: UploadFile = File(...), guild_id: str = Form(''), message_id: str = Form(''), sha256_value: str | None = Form(None, alias='sha256')):
    data = await read_limited_upload(file)
    try:
        return await analyzer.analyze(data, sha256_value)
    except HTTPException:
        raise
    except Exception as error:
        raise bad_image_error(error) from error

@router.post('/spam-images')
async def create_spam_image(file: UploadFile = File(...), guild_id: str = Form(''), registered_by_user_id: str = Form(''), category: str = Form(''), notes: str = Form('')):
    data = await read_limited_upload(file)
    digest = sha256(data)
    existing = repo.find_by_sha256(digest)
    if existing:
        return {'spam_image_id': existing['id'], 'sha256': digest, 'phash': existing.get('phash'), 'already_exists': True}
    try:
        img = load_image(data)
        image_phash = phash(img)
        emb = await embedding(img)
    except Exception as error:
        raise bad_image_error(error) from error
    storage = Path(settings.image_storage_dir)
    storage.mkdir(parents=True, exist_ok=True)
    image_path = storage / f'{digest}.bin'
    image_path.write_bytes(data)
    try:
        spam_id = repo.create({'guild_id': guild_id or None, 'sha256': digest, 'phash': image_phash, 'embedding': emb, 'image_path': str(image_path), 'category': category or None, 'notes': notes or None, 'registered_by_user_id': registered_by_user_id or None})
    except sqlite3.IntegrityError:
        existing_after_race = repo.find_by_sha256(digest)
        if existing_after_race:
            return {'spam_image_id': existing_after_race['id'], 'sha256': digest, 'phash': existing_after_race.get('phash'), 'already_exists': True}
        raise
    return {'spam_image_id': spam_id, 'sha256': digest, 'phash': image_phash, 'already_exists': False}
