import hashlib, io, json, asyncio
from PIL import Image
import imagehash
import numpy as np
import torch
from transformers import AutoImageProcessor, AutoModel
from app.core.config import settings

_model = None
_processor = None
_model_lock = asyncio.Lock()

def load_image(data: bytes) -> Image.Image:
    if len(data) > settings.max_image_size_mb * 1024 * 1024:
        raise ValueError('image too large')
    img = Image.open(io.BytesIO(data))
    img.verify()
    img = Image.open(io.BytesIO(data)).convert('RGB')
    if img.width * img.height > 40_000_000:
        raise ValueError('image pixel count too large')
    return img

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def phash(img: Image.Image) -> str:
    return str(imagehash.phash(img))

def hamming(a: str, b: str) -> int:
    return imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b)

async def embedding(img: Image.Image) -> list[float]:
    global _model, _processor
    async with _model_lock:
        if _model is None or _processor is None:
            _processor = AutoImageProcessor.from_pretrained(settings.dinov2_model_name)
            _model = AutoModel.from_pretrained(settings.dinov2_model_name)
            _model.eval()
    inputs = _processor(images=img, return_tensors='pt')
    with torch.no_grad():
        outputs = _model(**inputs)
        vector = outputs.last_hidden_state[:, 0, :].squeeze(0).cpu().numpy()
    norm = np.linalg.norm(vector)
    if norm == 0:
        return vector.tolist()
    return (vector / norm).astype(float).tolist()

def cosine(a: list[float], b_json: str) -> float:
    b = np.array(json.loads(b_json), dtype=np.float32)
    av = np.array(a, dtype=np.float32)
    denom = float(np.linalg.norm(av) * np.linalg.norm(b))
    return 0.0 if denom == 0 else float(np.dot(av, b) / denom)
