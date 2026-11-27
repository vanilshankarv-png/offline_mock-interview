import hmac

from fastapi import Header, HTTPException

from app.core.config import INTERNAL_KEY


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    if not INTERNAL_KEY or not x_internal_key or not hmac.compare_digest(
        x_internal_key.encode("utf-8"), INTERNAL_KEY.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing internal key")
