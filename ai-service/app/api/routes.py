from html import escape
from pathlib import Path
import sqlite3
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from PIL import Image
from app.core.config import settings
from app.repositories.spam_image_repository import SpamImageRepository
from app.services.analyzer import Analyzer
from app.services.image_features import load_image, sha256, phash, embedding

router = APIRouter(prefix='/v1')
repo = SpamImageRepository()
analyzer = Analyzer(repo)

MEDIA_TYPES = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp', 'GIF': 'image/gif'}

async def read_limited_upload(file: UploadFile) -> bytes:
    max_bytes = settings.max_image_size_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail='image exceeds size limit')
    return data

def bad_image_error(error: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'invalid or unsupported image: {type(error).__name__}')

def image_media_type(path: Path) -> str:
    with Image.open(path) as img:
        return MEDIA_TYPES.get(img.format or '', 'application/octet-stream')

def bot_saved_image_paths(row: dict) -> list[Path]:
    digest = row.get('sha256') or ''
    notes = row.get('notes') or ''
    paths: list[Path] = []
    for line in notes.splitlines():
        if not line.startswith('bot_image_path='):
            continue
        candidate = Path(line.removeprefix('bot_image_path=').strip())
        if candidate.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bin'}:
            continue
        if digest and candidate.stem != digest:
            continue
        paths.append(candidate)
    return paths

def unlink_existing(path: Path) -> None:
    if path.exists() and path.is_file():
        path.unlink()

def require_admin(request: Request) -> None:
    if not settings.admin_web_token:
        return
    token = request.query_params.get('token') or request.cookies.get('ai_admin_token') or request.headers.get('x-admin-token')
    if token != settings.admin_web_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='admin token required')

def admin_spam_image_row(row: dict) -> str:
    status_label = '有効' if row.get('active') == 1 else '削除済み'
    delete_form = f'''
      <form method="post" action="/v1/admin/spam-images/{row['id']}/delete" onsubmit="return confirm('このスパム画像を無効化しますか？DBデータと画像ファイルは残ります。');">
        <button class="danger" type="submit" {'disabled' if row.get('active') != 1 else ''}>無効化</button>
      </form>
      <form method="post" action="/v1/admin/spam-images/{row['id']}/delete-permanent" onsubmit="return confirm('このスパム画像のDBデータと保存画像ファイルを完全削除します。元に戻せません。実行しますか？');">
        <button class="danger permanent" type="submit">DBも完全削除</button>
      </form>'''
    return f'''
      <tr>
        <td><img src="/v1/spam-images/{row['id']}/image" alt="spam image {row['id']}" loading="lazy"></td>
        <td>{row['id']}</td>
        <td>{escape(row.get('guild_id') or '')}</td>
        <td><code>{escape((row.get('sha256') or '')[:16])}...</code></td>
        <td><code>{escape(row.get('phash') or '')}</code></td>
        <td colspan="2">
          <form method="post" action="/v1/admin/spam-images/{row['id']}/metadata">
            <input type="text" name="category" value="{escape(row.get('category') or '')}" placeholder="カテゴリ">
            <input type="text" name="notes" value="{escape(row.get('notes') or '')}" placeholder="備考">
            <button type="submit">保存</button>
          </form>
        </td>
        <td>{escape(row.get('registered_by_user_id') or '')}</td>
        <td>{escape(row.get('created_at') or '')}</td>
        <td>{status_label}</td>
        <td>{delete_form}</td>
      </tr>'''

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


@router.post('/admin/spam-images')
async def admin_create_spam_image(request: Request, file: UploadFile = File(...), guild_id: str = Form(''), registered_by_user_id: str = Form(''), category: str = Form(''), notes: str = Form('')):
    require_admin(request)
    await create_spam_image(file, guild_id, registered_by_user_id, category, notes)
    return RedirectResponse('/v1/admin/spam-images', status_code=status.HTTP_303_SEE_OTHER)

@router.post('/admin/spam-images/{spam_image_id}/metadata')
def admin_update_spam_image_metadata(request: Request, spam_image_id: int, category: str = Form(''), notes: str = Form('')):
    require_admin(request)
    if not repo.update_metadata(spam_image_id, category or None, notes or None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='spam image not found')
    return RedirectResponse('/v1/admin/spam-images', status_code=status.HTTP_303_SEE_OTHER)

@router.get('/spam-images/{spam_image_id}/image')
def get_spam_image_file(spam_image_id: int):
    row = repo.find_by_id(spam_image_id)
    if not row or not row.get('image_path'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='spam image not found')
    image_path = Path(row['image_path'])
    if not image_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='spam image file not found')
    return Response(content=image_path.read_bytes(), media_type=image_media_type(image_path))

@router.get('/admin/spam-images', response_class=HTMLResponse)
def admin_spam_images(request: Request):
    require_admin(request)
    rows = repo.find_all()
    body = ''.join(admin_spam_image_row(row) for row in rows) or '<tr><td colspan="11">登録済みスパム画像はありません。</td></tr>'
    response = HTMLResponse(f'''<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Spam Images Admin</title>
  <style>
    :root {{ color-scheme: light; --bg: #f6f8fb; --fg: #111827; --muted: #64748b; --card: rgba(255,255,255,.92); --card-strong: #fff; --line: #e5e7eb; --primary: #4f46e5; --primary-2: #06b6d4; --danger: #dc2626; --shadow: 0 22px 50px rgba(15,23,42,.10); }}
    body.dark {{ color-scheme: dark; --bg: #0f172a; --fg: #f8fafc; --muted: #94a3b8; --card: rgba(30,41,59,.88); --card-strong: #111827; --line: #334155; --primary: #818cf8; --primary-2: #22d3ee; --danger: #f87171; --shadow: 0 22px 50px rgba(0,0,0,.35); }}
    * {{ box-sizing: border-box; }}
    body {{ font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh; padding: 34px; background: radial-gradient(circle at top left, rgba(79,70,229,.18), transparent 32rem), radial-gradient(circle at top right, rgba(6,182,212,.16), transparent 28rem), var(--bg); color: var(--fg); }}
    h1 {{ margin: 0 0 8px; font-size: clamp(1.8rem, 3vw, 2.6rem); letter-spacing: -.04em; }}
    h2 {{ margin-top: 28px; }}
    p {{ color: var(--muted); }}
    table {{ border-collapse: separate; border-spacing: 0; width: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 24px; background: var(--card); box-shadow: var(--shadow); }}
    th, td {{ border-bottom: 1px solid var(--line); padding: 14px; vertical-align: top; text-align: left; }}
    tr:last-child td {{ border-bottom: 0; }}
    th {{ background: linear-gradient(135deg, rgba(79,70,229,.14), rgba(6,182,212,.10)); color: var(--muted); font-size: .82rem; letter-spacing: .06em; text-transform: uppercase; }}
    tr:hover td {{ background: rgba(79,70,229,.05); }}
    img {{ width: 160px; height: 120px; object-fit: contain; border-radius: 18px; background: var(--card-strong); box-shadow: 0 14px 30px rgba(15,23,42,.14); }}
    input {{ min-width: 160px; border: 1px solid var(--line); border-radius: 14px; background: var(--card-strong); color: var(--fg); padding: 10px 12px; outline: none; }}
    input:focus {{ border-color: var(--primary); box-shadow: 0 0 0 4px rgba(79,70,229,.16); }}
    form {{ display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }}
    button {{ color: #fff; background: linear-gradient(135deg, var(--primary), var(--primary-2)); border: 0; border-radius: 999px; padding: 10px 15px; font-weight: 800; cursor: pointer; box-shadow: 0 12px 24px rgba(79,70,229,.24); }}
    button.danger {{ background: linear-gradient(135deg, var(--danger), #f97316); }}
    button.permanent {{ background: linear-gradient(135deg, #7f1d1d, #dc2626); }}
    button:disabled {{ opacity: .45; cursor: not-allowed; box-shadow: none; }}
    code {{ padding: 3px 7px; border-radius: 8px; background: rgba(100,116,139,.14); word-break: break-all; }}
    @media (max-width: 760px) {{ body {{ padding: 18px; }} table {{ display: block; overflow-x: auto; }} }}
  </style>
  <script>
    function toggleTheme() {{ document.body.classList.toggle('dark'); localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light'); }}
    window.addEventListener('DOMContentLoaded', () => {{ if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark'); }});
  </script>
</head>
<body>
  <h1>登録済みスパム画像</h1>
  <p>誤って登録した画像は「無効化」で検知対象から外せます。「DBも完全削除」はDBデータとAI Service側の保存画像ファイルを削除します。</p>
  <button type="button" onclick="toggleTheme()">ライト/ダーク切替</button>
  <h2>新規登録</h2>
  <form method="post" action="/v1/admin/spam-images" enctype="multipart/form-data">
    <input type="file" name="file" accept="image/*" required>
    <input type="text" name="guild_id" placeholder="Guild ID">
    <input type="text" name="registered_by_user_id" placeholder="登録者ID">
    <input type="text" name="category" placeholder="カテゴリ">
    <input type="text" name="notes" placeholder="備考">
    <button type="submit">登録</button>
  </form>
  <table>
    <thead><tr><th>画像</th><th>ID</th><th>Guild</th><th>SHA-256</th><th>pHash</th><th>カテゴリ</th><th>備考</th><th>登録者</th><th>登録日時</th><th>状態</th><th>操作</th></tr></thead>
    <tbody>{body}</tbody>
  </table>
</body>
</html>''')
    if settings.admin_web_token and request.query_params.get('token') == settings.admin_web_token:
        response.set_cookie('ai_admin_token', settings.admin_web_token, httponly=True, samesite='lax')
    return response

@router.post('/admin/spam-images/{spam_image_id}/delete')
def admin_delete_spam_image(request: Request, spam_image_id: int):
    require_admin(request)
    if not repo.deactivate(spam_image_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='active spam image not found')
    return RedirectResponse('/v1/admin/spam-images', status_code=status.HTTP_303_SEE_OTHER)

@router.post('/admin/spam-images/{spam_image_id}/delete-permanent')
def admin_delete_spam_image_permanent(request: Request, spam_image_id: int):
    require_admin(request)
    row = repo.find_by_id(spam_image_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='spam image not found')
    image_path_value = row.get('image_path')
    if image_path_value:
        unlink_existing(Path(image_path_value))
    for bot_image_path in bot_saved_image_paths(row):
        unlink_existing(bot_image_path)
    if not repo.delete(spam_image_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='spam image not found')
    return RedirectResponse('/v1/admin/spam-images', status_code=status.HTTP_303_SEE_OTHER)
