#!/bin/bash
set -e

echo "=== 1. 安装 Docker ==="
curl -fsSL https://get.docker.com | bash
systemctl enable docker && systemctl start docker

echo "=== 2. 创建应用目录 ==="
mkdir -p /opt/salary/uploads

echo "=== 3. 登录天翼云镜像仓库 ==="
echo "请输入天翼云 AK（Access Key）:"
read -r AK
echo "请输入天翼云 SK（Secret Key）:"
read -rs SK
echo
docker login registry-crs-xinan1.ctyun.cn -u "$AK" -p "$SK"

echo "=== 4. 拉取镜像 ==="
docker pull registry-crs-xinan1.ctyun.cn/hookflow/salary-backend:latest
docker pull registry-crs-xinan1.ctyun.cn/hookflow/salary-frontend:latest

echo "=== 5. 生成环境变量 ==="
if [ ! -f "/opt/salary/.env" ]; then
    SECRET=$(openssl rand -hex 32)
    echo "SALARY_TOKEN_SECRET=$SECRET" > /opt/salary/.env
    echo "已生成 TOKEN_SECRET"
fi

echo ""
echo "=== 初始化完成 ==="
echo "请将 docker-compose.prod.yml 上传到 /opt/salary/ 后执行:"
echo "  cd /opt/salary && docker compose -f docker-compose.prod.yml up -d"
