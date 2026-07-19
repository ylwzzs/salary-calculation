#!/bin/bash
set -e

# ─────────────────────────────────────────────
# 牛奶提成系统 - 服务器部署脚本
# 用法: bash deploy.sh
# ─────────────────────────────────────────────

APP_DIR="/opt/salary"
REGISTRY="registry-crs-xinan1.ctyun.cn"
NAMESPACE="salary_calculation"

echo "=== 1. 安装 Docker ==="
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker && systemctl start docker
    echo "Docker 已安装"
else
    echo "Docker 已存在，跳过"
fi

echo "=== 2. 创建应用目录 ==="
mkdir -p $APP_DIR/uploads

echo "=== 3. 登录天翼云镜像仓库 ==="
echo "请输入天翼云 AK（Access Key）:"
read -r AK
echo "请输入天翼云 SK（Secret Key）:"
read -rs SK
echo
docker login $REGISTRY -u "$AK" -p "$SK"

echo "=== 4. 拉取镜像 ==="
docker pull $REGISTRY/$NAMESPACE/salary-backend:latest
docker pull $REGISTRY/$NAMESPACE/salary-frontend:latest

echo "=== 5. 创建环境配置 ==="
if [ ! -f "$APP_DIR/.env" ]; then
    SECRET=$(openssl rand -hex 32)
    echo "SALARY_TOKEN_SECRET=$SECRET" > $APP_DIR/.env
    echo "已生成 TOKEN_SECRET"
else
    echo ".env 已存在，跳过"
fi

echo "=== 6. 启动服务 ==="
cd $APP_DIR
# 下载 compose 文件（如果本地没有）
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "请将 deploy/docker-compose.prod.yml 上传到 $APP_DIR/"
    exit 1
fi

docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== 部署完成 ==="
echo "前端访问: http://$(curl -s ifconfig.me)"
echo "后端 API:  http://$(curl -s ifconfig.me):8000/health"
echo ""
echo "常用命令:"
echo "  查看日志:  docker compose -f $APP_DIR/docker-compose.prod.yml logs -f"
echo "  重启服务:  docker compose -f $APP_DIR/docker-compose.prod.yml restart"
echo "  停止服务:  docker compose -f $APP_DIR/docker-compose.prod.yml down"
