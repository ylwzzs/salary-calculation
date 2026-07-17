-- 薪酬制度版本管理数据库迁移
-- 执行方式: sqlite3 salary.db < migrations/001_add_policy_version_id.sql

-- 1. 创建 salary_policy_versions 表（如果不存在）
CREATE TABLE IF NOT EXISTS salary_policy_versions (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    effective_from DATE NOT NULL,
    is_current BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    content JSON NOT NULL,
    note VARCHAR(200)
);

-- 2. 为 months 表添加 policy_version_id 列（如果不存在）
-- SQLite 不支持 IF NOT EXISTS，需要手动检查
-- 如果已存在会报错，可以忽略
ALTER TABLE months ADD COLUMN policy_version_id INTEGER REFERENCES salary_policy_versions(id);
