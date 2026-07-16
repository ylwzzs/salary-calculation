import tempfile, os
from fastapi import APIRouter, Depends, Form, UploadFile, File
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, User
from backend.app.services.import_master import upsert_products, upsert_stores
from salary_engine.importer import load_products_xlsx, load_stores_xlsx

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/products")
def import_products(info: UploadFile = File(...), cost: UploadFile = File(None),
                    _: User = Depends(current_user), db: Session = Depends(get_db)):
    info_path = _save(info)
    cost_path = _save(cost) if cost else None
    products = load_products_xlsx(info_path, cost_path)
    n = upsert_products(db, products)
    _clean(info_path, cost_path)
    return {"products": n}


@router.post("/stores")
def import_stores(file: UploadFile = File(...), sheet: str = Form(None),
                  month: str = Form(None),
                  _: User = Depends(current_user), db: Session = Depends(get_db)):
    path = _save(file)
    stores, targets = load_stores_xlsx(path, sheet)
    n = upsert_stores(db, stores, targets, month=month)
    _clean(path)
    return {"stores": n}


def _save(f: UploadFile) -> str:
    suffix = os.path.splitext(f.filename or "u.xlsx")[1] or ".xlsx"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as out:
        out.write(f.file.read())
    return path


def _clean(*paths):
    for p in paths:
        if p:
            try: os.remove(p)
            except OSError: pass
