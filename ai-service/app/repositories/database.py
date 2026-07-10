import sqlite3
from pathlib import Path
from app.core.config import settings
Path(settings.ai_database_path).parent.mkdir(parents=True, exist_ok=True)
conn = sqlite3.connect(settings.ai_database_path, check_same_thread=False)
conn.row_factory = sqlite3.Row
schema_path = Path(__file__).with_name('schema.sql')
conn.executescript(schema_path.read_text())
conn.commit()
