"""导出文件经天翼云 OBS 分发（ADR-022）。

上传走云内网 endpoint（快、省公网流量），下载走公网签名 URL（浏览器跟随 302
从 OBS 高带宽取文件，绕开服务器上行带宽瓶颈）。未配置 OSS 时上层回退直连下载。
"""
import os

from botocore.exceptions import ClientError


def _env(k, default=""):
    return os.environ.get(k, default)


def is_configured() -> bool:
    """OSS 配置齐全才启用。缺任一关键项 → 上层回退直连。"""
    return bool(_env("OSS_BUCKET") and _env("OSS_ACCESS_KEY") and _env("OSS_SECRET_KEY"))


def _clients():
    """返回 (upload, presign) 两个 S3 client：upload 走内网 path-style，presign 走公网 virtual-host。"""
    import boto3
    from botocore.config import Config

    ak = _env("OSS_ACCESS_KEY")
    sk = _env("OSS_SECRET_KEY")
    region = _env("OSS_REGION", "xinan1")
    int_endpoint = _env("OSS_ENDPOINT_INTERNAL", "http://xinan-1-internal.zos.ctyun.cn")
    pub_endpoint = _env("OSS_ENDPOINT_PUBLIC", "https://xinan1.zos.ctyun.cn")
    cfg_int = Config(signature_version="s3v4", s3={"addressing_style": "path"})
    cfg_pub = Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
    upload = boto3.client("s3", endpoint_url=int_endpoint,
                          aws_access_key_id=ak, aws_secret_access_key=sk,
                          region_name=region, config=cfg_int)
    presign = boto3.client("s3", endpoint_url=pub_endpoint,
                           aws_access_key_id=ak, aws_secret_access_key=sk,
                           region_name=region, config=cfg_pub)
    return upload, presign


# 导出格式版本：改动导出列/结构时 +1，使缓存路径与 OSS key 变化 → 自动失效旧产物（ADR-021/022）
EXPORT_VERSION = "v2"


def object_key(month: str) -> str:
    return f"{_env('OSS_PREFIX', 'salary/')}{EXPORT_VERSION}/{month}.xlsx"


def ensure_upload(month: str, local_path: str) -> bool:
    """确保 OSS 上有最新导出文件。

    本地文件缺失/OSS 无此对象/本地 mtime 更新 → 上传覆盖。返回是否上传。
    未配置 OSS 或本地文件不存在 → False（不动）。
    """
    if not is_configured() or not os.path.exists(local_path):
        return False
    upload, _ = _clients()
    bucket = _env("OSS_BUCKET")
    key = object_key(month)
    local_mtime = os.path.getmtime(local_path)
    needs = True
    try:
        head = upload.head_object(Bucket=bucket, Key=key)
        oss_ts = head["LastModified"].timestamp()
        needs = local_mtime > oss_ts
    except ClientError:
        needs = True  # 404 或其它 → 上传
    if needs:
        with open(local_path, "rb") as f:
            upload.put_object(
                Bucket=bucket, Key=key, Body=f,
                ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return needs


def presign_url(month: str, expires: int = 900) -> str:
    """公网签名下载 URL（默认 15 分钟有效）。"""
    _, presign = _clients()
    return presign.generate_presigned_url(
        "get_object", Params={"Bucket": _env("OSS_BUCKET"), "Key": object_key(month)},
        ExpiresIn=expires)
