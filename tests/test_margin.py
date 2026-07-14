from salary_engine.models import Product

def test_product_construct(products):
    assert products["6920001"].category == "低温奶"
