import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # 仓库根
DB_PATH = Path(os.environ.get("SALARY_DB", BASE_DIR / "salary.db"))
DB_URL = f"sqlite:///{DB_PATH}"
TOKEN_SECRET = os.environ.get("SALARY_TOKEN_SECRET", "dev-secret-change-me")
TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 天
DEFAULT_ADMIN = {"username": "admin", "password": "admin"}  # 首启种子账号
