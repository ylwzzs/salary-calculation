# 部署指南

## 一、服务器准备

1. 购买天翼云 ECS（推荐 2C4G，Ubuntu 22.04）
2. 开放安全组端口：**80**（前端）、**8000**（后端 API）

## 二、首次部署

```bash
# 上传文件到服务器
scp deploy/deploy.sh deploy/docker-compose.prod.yml root@<服务器IP>:/opt/salary/

# SSH 登录服务器
ssh root@<服务器IP>

# 执行部署
cd /opt/salary
bash deploy.sh
```

脚本会自动：安装 Docker → 登录天翼云 → 拉取镜像 → 生成密钥 → 启动服务

## 三、更新部署

每次 push 到 GitHub main 分支，CI 会自动构建新镜像。在服务器上执行：

```bash
cd /opt/salary
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 四、自动化更新（可选）

在服务器上设置定时任务，每天自动拉取最新镜像：

```bash
# crontab -e
0 3 * * * cd /opt/salary && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d >> /var/log/salary-deploy.log 2>&1
```

## 五、CI/CD 自动部署（推荐）

在 GitHub Actions 中添加自动部署，push 后自动 SSH 到服务器更新：

### 添加 GitHub Secrets

| Secret 名 | 值 |
|-----------|-----|
| `DEPLOY_HOST` | 服务器 IP |
| `DEPLOY_USER` | SSH 用户名（通常 root） |
| `DEPLOY_KEY` | SSH 私钥内容 |

### 流程

```
push main → 测试 → 构建镜像推送到天翼云 → SSH 到服务器 docker compose pull && up -d
```

## 六、常用运维命令

```bash
# 查看日志
docker compose -f /opt/salary/docker-compose.prod.yml logs -f

# 查看后端日志
docker compose -f /opt/salary/docker-compose.prod.yml logs -f backend

# 重启
docker compose -f /opt/salary/docker-compose.prod.yml restart

# 进入后端容器
docker exec -it salary-backend-1 bash

# 查看数据库
docker exec -it salary-backend-1 sqlite3 /data/salary.db ".tables"
```
