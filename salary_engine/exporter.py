"""导出工资表（CLI 结果页 sheet）。

CLI 独立导出（无 DB）：Sheet1 计算结果（来自 result.breakdown），Sheet2 销售明细
仅表头（CLI 无 SalesRecord）。Web 导出走 backend.app.services.ledger_export，
不经过此处（H2：删掉了不可达的 db 分支 + 对 backend.db 的硬耦合，H12）。
"""
from salary_engine.calculator import ComputeResult


def write_excel(result: ComputeResult, out_path: str, month: str = None):
    """用 openpyxl 写两个 sheet：
    Sheet1: 计算结果列表 + 档位提成明细列（来自 result.breakdown）
    Sheet2: 销售明细表头（CLI 无 SalesRecord，仅表头）

    month 参数保留兼容签名但 CLI 路径不使用（Web 用 ledger_export）。
    """
    import openpyxl
    from openpyxl.styles import Alignment, Border, Side, Font

    wb = openpyxl.Workbook()

    # ============ Sheet1: 计算结果 ============
    ws1 = wb.active
    ws1.title = "计算结果"

    headers1 = [
        "员工姓名", "门店", "门店类型", "月目标", "日目标",
        "考勤天数", "实际目标", "销售额", "达标率", "达标档位", "提成金额",
        # 档位明细列
        "常温高毛_销售", "常温高毛_比例", "常温高毛_提成",
        "常温低毛_销售", "常温低毛_比例", "常温低毛_提成",
        "低温高毛_销售", "低温高毛_比例", "低温高毛_提成",
        "低温低毛_销售", "低温低毛_比例", "低温低毛_提成",
        "特价_销售", "特价_比例", "特价_提成",
    ]
    ws1.append(headers1)

    # 表头样式
    header_font = Font(bold=True)
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )
    for cell in ws1[1]:
        cell.font = header_font
        cell.alignment = header_align
        cell.border = thin_border

    # CLI 无 DB：门店类型/考勤/目标等列走 build_rows_from_breakdown 内置默认
    total_days = 30
    tier_names = ["常温高毛", "常温低毛", "低温高毛", "低温低毛", "特价"]

    from salary_engine.exporter_helpers import build_rows_from_breakdown
    rows_data = build_rows_from_breakdown(
        result, {}, {}, {}, {}, total_days, tier_names
    )

    # 写入行并合并同员工单元格
    row_idx = 2  # Excel 行号（第1行是表头）
    for person, stores_data in rows_data:
        start_row = row_idx
        for sd in stores_data:
            ws1.append(sd)
            for col in range(1, len(headers1) + 1):
                cell = ws1.cell(row=row_idx, column=col)
                cell.border = thin_border
                cell.alignment = Alignment(horizontal="center", vertical="center")
            row_idx += 1

        # 合并同员工的姓名列（A列）
        end_row = row_idx - 1
        if end_row > start_row:
            ws1.merge_cells(start_row=start_row, start_column=1, end_row=end_row, end_column=1)
            ws1.cell(row=start_row, column=1).alignment = Alignment(
                horizontal="center", vertical="center"
            )

    # 设置列宽
    col_widths = {
        1: 10, 2: 14, 3: 8, 4: 10, 5: 10,
        6: 8, 7: 10, 8: 12, 9: 8, 10: 8, 11: 12,
    }
    for col, w in col_widths.items():
        ws1.column_dimensions[openpyxl.utils.get_column_letter(col)].width = w
    for col in range(12, len(headers1) + 1):
        ws1.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 12

    # ============ Sheet2: 销售明细（CLI 仅表头） ============
    ws2 = wb.create_sheet("销售明细")

    headers2 = [
        "标签", "小票号", "源单号", "门店", "日期", "条码", "商品名称",
        "单价", "数量", "金额", "营业员", "收银员", "退货", "线上",
        "原始门店", "原始日期", "调整原因",
    ]
    ws2.append(headers2)
    for cell in ws2[1]:
        cell.font = header_font
        cell.alignment = header_align
        cell.border = thin_border

    # 设置列宽
    for col in range(1, len(headers2) + 1):
        ws2.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 14

    wb.save(out_path)
