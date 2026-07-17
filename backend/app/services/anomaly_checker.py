from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from backend.app.db import Product, Store


class AnomalyChecker:
    """异常检查服务，产出待处理的异常列表。"""

    def __init__(self, db: Session, month: str):
        self.db = db
        self.month = month
        self.anomalies: List[Dict[str, Any]] = []

    def check_store_exists(self, store_names: List[str]):
        """异常1: 交易流水门店不存在"""
        existing: Set[str] = {s.name for s in self.db.query(Store).all()}
        for name in store_names:
            if name not in existing:
                self.anomalies.append({
                    "month": self.month,
                    "anomaly_type": "1",
                    "entity_type": "store",
                    "entity_id": name,
                    "description": f"门店「{name}」在门店管理中不存在",
                    "status": "pending",
                })

    def check_product_exists(self, barcodes: List[str]):
        """异常2: 交易流水商品不存在"""
        existing: Set[str] = {p.barcode for p in self.db.query(Product).all()}
        for barcode in barcodes:
            if barcode not in existing:
                self.anomalies.append({
                    "month": self.month,
                    "anomaly_type": "2",
                    "entity_type": "product",
                    "entity_id": barcode,
                    "description": f"条码「{barcode}」在商品档案中不存在",
                    "status": "pending",
                })

    def check_targets(self, stores: List[Dict[str, Any]], target_stores: Set[str]):
        """异常3: 门店无目标且未打不参与考核标签"""
        for s in stores:
            if s.get("exclude_assessment"):
                continue
            if s["name"] not in target_stores:
                self.anomalies.append({
                    "month": self.month,
                    "anomaly_type": "3",
                    "entity_type": "store",
                    "entity_id": s["name"],
                    "description": f"「{s['name']}」无月度目标值",
                    "status": "pending",
                })

    def check_products_complete(self, barcodes: List[str]):
        """异常4: 商品缺类别/成本且未打不计提成"""
        products = (
            self.db.query(Product)
            .filter(Product.barcode.in_(barcodes))
            .all()
        )
        for p in products:
            if p.exclude_commission:
                continue
            missing: List[str] = []
            if not p.category:
                missing.append("类别")
            if p.cost is None:
                missing.append("销售成本")
            if missing:
                self.anomalies.append({
                    "month": self.month,
                    "anomaly_type": "4",
                    "entity_type": "product",
                    "entity_id": p.barcode,
                    "description": f"「{p.barcode}」缺少{'、'.join(missing)}",
                    "status": "pending",
                })

    def get_anomalies(self) -> List[Dict[str, Any]]:
        return self.anomalies
