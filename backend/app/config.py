import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # 仓库根
DB_PATH = Path(os.environ.get("SALARY_DB", BASE_DIR / "salary.db"))
DB_URL = f"sqlite:///{DB_PATH}"
# C7 安全修复：拒绝空密钥（compose 未配 .env 时会注入空串 → 可伪造 token）。
# 未设置时用开发默认值（本地/测试可用）；显式设为空则启动失败。
_env_secret = os.environ.get("SALARY_TOKEN_SECRET")
if _env_secret == "":
    raise RuntimeError("SALARY_TOKEN_SECRET 不能为空；生产请在 .env 配置真实密钥（部署脚本自动生成）")
TOKEN_SECRET = _env_secret or "dev-secret-change-me"
TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 天
DEFAULT_ADMIN = {"username": "admin", "password": "admin"}  # 首启种子账号
