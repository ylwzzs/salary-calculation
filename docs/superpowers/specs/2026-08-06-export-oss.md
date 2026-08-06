# 导出经天翼云 OBS 下载（ADR-022）

> 2026-08-06。生成已优化到 0.03s（ADR-021 缓存），瓶颈在服务器上行带宽（~2-3Mbps）。

## 背景

下载 7.2MB 导出文件从服务器直连需 20-45s（带宽封顶）。上传到对象存储走 CDN/高带宽，下载秒级。

## 决策

- **上传**：服务器内网 endpoint `http://xinan-1-internal.zos.ctyun.cn`（path-style，实测 0.01s），region `xinan1`，key `salary/{month}.xlsx`。
- **下载**：公网 virtual-host `https://mytech-lesson.xinan1.zos.ctyun.cn/{key}` 签名 URL（15 分钟），浏览器跟随 302 从 OBS 下载。
- **未配 OSS** → 回退直连下载（原行为），保证测试/非 OSS 环境可用。

## 实现要点

- `backend/app/services/oss_export.py`：
  - `is_configured()`：检查 `OSS_BUCKET`/`OSS_ACCESS_KEY`/`OSS_SECRET_KEY` 是否齐全。
  - `ensure_upload(month, local_path)`：`head_object` 对比本地 mtime vs OSS last_modified，缺失或新则 `put_object`（内网上传）。
  - `presign_url(month)`：公网 endpoint + virtual 寻址，`generate_presigned_url`（ExpiresIn=900）。
- `/export` 端点：OSS 已配 → `ensure_upload`（cache 命中时 head 快检）→ `RedirectResponse(presign_url, 302)`；未配 → 直连（现有 FileResponse/Response）。
- compute 后台预生成：写完缓存后调 `ensure_upload`（fresh build 必上传）。
- env：`OSS_ENDPOINT_INTERNAL`/`OSS_ENDPOINT_PUBLIC`/`OSS_BUCKET`/`OSS_ACCESS_KEY`/`OSS_SECRET_KEY`/`OSS_REGION`/`OSS_PREFIX`。
- 桶 CORS：`put_bucket_cors` 允许 GET（`*` origin，签名 URL 即鉴权），使浏览器能读 blob。
- 依赖：`requirements.txt` 加 `boto3`。

## 测试

- OSS 未配置 → `/export` 直连 200（现有测试不变）。
- OSS 配置 + mock（monkeypatch `ensure_upload`/`presign_url`）→ `/export` 返回 302 + Location 为签名 URL。
- 上传在文件生成后触发（compute 预生成 / 导出兜底）。
