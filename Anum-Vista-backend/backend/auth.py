"""
auth.py — JWT authentication + role-based access for Anum Vista
"""
import json
import os, secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend import models
except ImportError:
    from database import get_db
    import models

# ── Config ────────────────────────────────────────────────────────────────────
_env_secret = os.getenv("JWT_SECRET_KEY")
if _env_secret:
    SECRET_KEY = _env_secret
else:
    SECRET_KEY = secrets.token_urlsafe(64)
    print(
        "\nWARNING: JWT_SECRET_KEY not set in environment. "
        "Using a random key - all sessions will expire on server restart.\n"
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# ── Crypto ────────────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Password cannot be longer than 72 bytes")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        return False
    return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ── Dependencies ──────────────────────────────────────────────────────────────
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role not in (
        models.UserRole.admin,
        models.UserRole.senior_admin,
        models.UserRole.super_admin,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_senior_or_super(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role not in (models.UserRole.senior_admin, models.UserRole.super_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Senior Admin or Super Admin access required",
        )
    return current_user


def require_super_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != models.UserRole.super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin access required")
    return current_user


# ── Dynamic Role Permissions ──────────────────────────────────────────────────
PERMISSION_KEYS = (
    "overview",
    "analytics",
    "treasury",
    "extra_curriculars",
    "audit_trail",
    "reports_ledger",
    "residents",
    "cars_parking",
    "transactions",
)

DEFAULT_ROLE_PERMISSIONS: dict[str, dict[str, bool]] = {
    "super_admin": {k: True for k in PERMISSION_KEYS},
    "senior_admin": {
        "overview": True,
        "analytics": True,
        "treasury": True,
        "extra_curriculars": True,
        "audit_trail": False,
        "reports_ledger": False,
        "residents": True,
        "cars_parking": True,
        "transactions": True,
    },
    "admin": {
        "overview": False,
        "analytics": False,
        "treasury": False,
        "extra_curriculars": False,
        "audit_trail": False,
        "reports_ledger": False,
        "residents": True,
        "cars_parking": True,
        "transactions": True,
    },
}

_role_perms_cache: dict[str, dict[str, bool]] | None = None


def get_all_role_permissions(db: Session) -> dict[str, dict[str, bool]]:
    global _role_perms_cache
    if _role_perms_cache is not None:
        return {r: dict(p) for r, p in _role_perms_cache.items()}

    stored: dict[str, dict[str, bool]] = {}
    try:
        row = db.execute(text("SELECT value FROM app_settings WHERE key = 'role_permissions'")).first()
        if row and row[0]:
            parsed = json.loads(row[0])
            if isinstance(parsed, dict):
                stored = parsed
    except Exception:
        pass

    merged: dict[str, dict[str, bool]] = {}
    for role_name in ("senior_admin", "admin"):
        base = dict(DEFAULT_ROLE_PERMISSIONS[role_name])
        override = stored.get(role_name)
        if isinstance(override, dict):
            for k in PERMISSION_KEYS:
                if k in override:
                    base[k] = bool(override[k])
        merged[role_name] = base

    _role_perms_cache = merged
    return {r: dict(p) for r, p in merged.items()}


def set_role_permissions(db: Session, role_name: str, perms: dict[str, bool]) -> dict[str, bool]:
    global _role_perms_cache
    if role_name not in ("senior_admin", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only senior_admin and admin roles can be edited")

    current = get_all_role_permissions(db)
    updated_role = dict(current[role_name])
    for k in PERMISSION_KEYS:
        if k in perms:
            updated_role[k] = bool(perms[k])
    current[role_name] = updated_role

    db.execute(text("CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR PRIMARY KEY, value VARCHAR)"))
    serialized = json.dumps(current)
    existing = db.execute(text("SELECT 1 FROM app_settings WHERE key = 'role_permissions'")).first()
    if existing:
        db.execute(text("UPDATE app_settings SET value = :v WHERE key = 'role_permissions'"), {"v": serialized})
    else:
        db.execute(text("INSERT INTO app_settings (key, value) VALUES ('role_permissions', :v)"), {"v": serialized})
    db.commit()

    _role_perms_cache = current
    return dict(updated_role)


def get_effective_permissions(db: Session, role: models.UserRole | str) -> dict[str, bool]:
    role_str = role.value if hasattr(role, "value") else str(role)
    if role_str == "super_admin":
        return dict(DEFAULT_ROLE_PERMISSIONS["super_admin"])
    all_perms = get_all_role_permissions(db)
    return dict(all_perms.get(role_str, DEFAULT_ROLE_PERMISSIONS["admin"]))


def require_permission(perm_key: str):
    def _dep(
        current_user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> models.User:
        perms = get_effective_permissions(db, current_user.role)
        if not perms.get(perm_key, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{perm_key}' is required for this resource",
            )
        return current_user

    return _dep
