"""密码哈希(stdlib) + 令牌(itsdangerous) + 鉴权依赖。"""
import hashlib
import hmac
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.app.config import TOKEN_SECRET, TOKEN_MAX_AGE, DEFAULT_ADMIN
from backend.app.db import get_db, User, SessionLocal

_serializer = URLSafeTimedSerializer(TOKEN_SECRET, salt="auth")
_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    salt = b"salary-static-salt"  # MVP 固定盐；后续可每用户随机盐
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return dk.hex()


def verify_password(password: str, pw_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), pw_hash)


def make_token(username: str) -> str:
    return _serializer.dumps({"u": username})


def current_user(token: str = Depends(_oauth2), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登录")
    try:
        data = _serializer.loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "令牌无效或过期")
    user = db.query(User).filter_by(username=data["u"]).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
    return user


def seed_admin():
    """首启若无用户则建默认管理员。"""
    db = SessionLocal()
    try:
        if not db.query(User).first():
            db.add(User(username=DEFAULT_ADMIN["username"],
                        password_hash=hash_password(DEFAULT_ADMIN["password"])))
            db.commit()
    finally:
        db.close()
