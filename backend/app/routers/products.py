from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Product, User, mark_all_months_stale
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
    mark_all_months_stale(db)
    db.commit()
    return p


class ProductPatch(BaseModel):
    name: Optional[Any] = None
    spec: Optional[Any] = None
    category: Optional[Any] = None
    cost: Optional[Any] = None
    exclude_commission: Optional[bool] = None


@router.patch("/{barcode}", response_model=ProductOut)
def patch_product(barcode: str, body: ProductPatch,
                  _: User = Depends(current_user), db: Session = Depends(get_db)):
    """部分更新商品字段，只更新传入的字段"""
    p = db.get(Product, barcode)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "商品不存在")
    # 获取请求体中的字段（区分未传入和传入null）
    update_data = body.dict(exclude_unset=True)
    for f, val in update_data.items():
        if f in ("name", "spec", "category", "cost", "exclude_commission"):
            setattr(p, f, val)
    mark_all_months_stale(db)
    db.commit()
    return p


@router.delete("/{barcode}")
def delete_product(barcode: str,
                   _: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Product, barcode)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "商品不存在")
    db.delete(p)
    mark_all_months_stale(db)
    db.commit()
    return {"deleted": barcode}
