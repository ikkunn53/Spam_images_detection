from pathlib import Path
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

@router.post('/analyze')
async def analyze(file: UploadFile = File(...), guild_id: str = Form(''), message_id: str = Form(''), sha256_value: str | None = Form(None, alias='sha256')):
    data = await read_limited_upload(file)
    return await analyzer.analyze(data, sha256_value)

@router.post('/spam-images')
async def create_spam_image(file: UploadFile = File(...), guild_id: str = Form(''), registered_by_user_id: str = Form(''), category: str = Form(''), notes: str = Form('')):
    data = await read_limited_upload(file)
    img = load_image(data)
    digest = sha256(data)
    image_phash = phash(img)
    emb = await embedding(img)
    storage = Path(settings.image_storage_dir)
    storage.mkdir(parents=True, exist_ok=True)
    image_path = storage / f'{digest}.bin'
    image_path.write_bytes(data)
    spam_id = repo.create({'guild_id': guild_id or None, 'sha256': digest, 'phash': image_phash, 'embedding': emb, 'image_path': str(image_path), 'category': category or None, 'notes': notes or None, 'registered_by_user_id': registered_by_user_id or None})
    return {'spam_image_id': spam_id, 'sha256': digest, 'phash': image_phash}
