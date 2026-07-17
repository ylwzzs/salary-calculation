from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Product, User
from backend.app.schemas import ProductOut, ProductUpsert

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(Product).order_by(Product.barcode).all()


@router.put("/{barcode}", response_model=ProductOut)
def upsert_product(barcode: str, body: ProductUpsert,
                   _: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.barcode != barcode:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "条码不一致")
    p = db.get(Product, barcode)
    if p is None:
        p = Product(barcode=barcode)
        db.add(p)
    for f in ("name", "spec", "category", "cost", "exclude_commission"):
        setattr(p, f, getattr(body, f))
    db.commit()
    return p
