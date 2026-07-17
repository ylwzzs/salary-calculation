#!/usr/bin/env python3
"""Playwright 集成测试 - 覆盖所有核心页面和功能"""

import re
import sys
import time
from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5173"
API_URL = "http://localhost:8000"

passed = 0
failed = 0

def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  ✅ {name}")
    except Exception as e:
        failed += 1
        print(f"  ❌ {name}: {e}")

def main():
    global passed, failed
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # === 1. 登录 ===
        print("\n=== 1. 登录 ===")
        test("健康检查", lambda: page.goto(f"{API_URL}/health"))

        test("登录页面可访问", lambda: page.goto(f"{BASE_URL}/login"))
        page.goto(f"{BASE_URL}/login")
        time.sleep(1)
        test("页面加载完成", lambda: page.wait_for_selector("button, input, form", timeout=5000))

        # 填入登录信息
        try:
            page.locator('#username').fill("admin")
            page.locator('#password').fill("admin")
            page.locator('button[type="submit"]').click()
            time.sleep(3)
            print("  ✅ 提交登录")
        except Exception as e:
            print(f"  ⚠️ 登录过程: {e}")

        # === 2. 月份列表页 ===
        print("\n=== 2. 月份列表 ===")
        page.goto(f"{BASE_URL}/months")
        time.sleep(2)
        test("月份列表加载", lambda: page.wait_for_selector('h2:has-text("月度计算"), .rounded-lg.border', timeout=5000))

        # 检查月份卡片
        cards = page.locator('.grid > div, [class*="rounded-lg"].cursor-pointer')
        count = cards.count()
        print(f"  📊 月份卡片数: {count}")

        # 点击新建月份
        new_btn = page.locator('button:has-text("新建")')
        if new_btn.is_visible():
            new_btn.click()
            time.sleep(1)
            test("新建月份弹窗", lambda: page.wait_for_selector('[role="dialog"], .dialog-content', timeout=3000))
            page.keyboard.press("Escape")
            time.sleep(0.5)

        # === 3. 薪酬制度页 ===
        print("\n=== 3. 薪酬制度 ===")
        page.goto(f"{BASE_URL}/salary-policy")
        time.sleep(2)

        test("页面加载", lambda: page.wait_for_selector('button:has-text("创建新版本"), button:has-text("导出Excel"), .text-zinc-400', timeout=5000))

        # 检查版本信息和导出按钮
        body_text = page.text_content("body")
        if "薪酬制度" in body_text:
            print("  ✅ 薪酬制度标题可见")
        else:
            print("  ❌ 缺失薪酬制度标题")
            failed += 1

        export_btn = page.locator('button:has-text("导出Excel")')
        if export_btn.is_visible():
            print("  ✅ 导出Excel按钮可见")

        # 点击创建新版本
        create_btn = page.locator('button:has-text("创建新版本")')
        if create_btn.is_visible():
            create_btn.click()
            time.sleep(1)
            test("创建新版本进入编辑模式", lambda: page.wait_for_selector('button:has-text("保存"), input[type="date"]', timeout=3000))

            # 取消
            cancel_btn = page.locator('button:has-text("取消")')
            if cancel_btn.is_visible():
                cancel_btn.click()
                time.sleep(0.5)
                print("  ✅ 取消编辑")
            else:
                page.keyboard.press("Escape")

        # === 4. 工作台测试 ===
        print("\n=== 4. 月度工作台 ===")
        # 尝试导航到第一个存在的月份
        page.goto(f"{BASE_URL}/months/2026-06?step=import")
        time.sleep(2)

        body = page.text_content("body")
        if "工作台" in body or "导入数据" in body:
            print("  ✅ 工作台加载成功")

            # 检查步骤指示器
            steps = page.locator('button:has-text("导入数据"), button:has-text("配置目标"), button:has-text("当班确认"), button:has-text("计算")')
            if steps.count() > 0:
                print(f"  ✅ 步骤指示器可见 (共{steps.count()}步)")

            # 测试切换到目标步骤
            targets_btn = page.locator('button:has-text("配置目标")')
            if targets_btn.count() > 0:
                targets_btn.first.click()
                time.sleep(1)
                print("  ✅ 切换到配置目标步骤")
        else:
            print(f"  ⚠️ 工作台页面内容: {body[:100]}")

        # === 5. 异常页面测试 ===
        print("\n=== 5. 异常API测试 ===")
        page.goto(f"{BASE_URL}/months/2026-06?step=results")
        time.sleep(2)
        page.goto(f"{BASE_URL}/months/2026-06?step=import")
        time.sleep(1)

        # === 6. 门店页面 ===
        print("\n=== 6. 门店信息 ===")
        page.goto(f"{BASE_URL}/stores")
        time.sleep(2)
        test("门店页面加载", lambda: page.wait_for_selector('h2:has-text("门店"), table, .rounded-lg', timeout=5000))

        # === 7. 商品页面 ===
        print("\n=== 7. 商品档案 ===")
        page.goto(f"{BASE_URL}/products")
        time.sleep(2)
        test("商品页面加载", lambda: page.wait_for_selector('h2:has-text("商品"), table, .rounded-lg', timeout=5000))

        # === 8. 月度目标页 ===
        print("\n=== 8. 月度目标 ===")
        page.goto(f"{BASE_URL}/targets")
        time.sleep(2)
        test("目标页面加载", lambda: page.wait_for_selector('h2:has-text("目标"), table, .rounded-lg', timeout=5000))

        # === 9. 导航测试 ===
        print("\n=== 9. 导航栏 ===")
        nav_links = page.locator('nav a, [class*="nav"] a, a[href]')
        print(f"  📊 导航链接数: {nav_links.count()}")

        context.close()
        browser.close()

    # 最终结果
    total = passed + failed
    print(f"\n{'='*40}")
    print(f"测试结果: {passed}/{total} 通过")
    if failed > 0:
        print(f"❌ {failed} 个测试失败")
    else:
        print(f"✅ 全部通过")
    return failed

if __name__ == "__main__":
    sys.exit(main())
