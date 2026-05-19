# PostgreSQL 数据库配置

## 安装内容

- PostgreSQL 服务
- 基础端口策略
- 备份目录建议

## 简单私人配置

数据库密码和实际数据不进入市场配置。数据迁移应使用 PostgreSQL 自身的 `pg_dump` / `pg_restore`。

```bash
pg_dump --format=custom --file backup.dump your_database
pg_restore --dbname target_database backup.dump
```

## 隐私说明

数据库内容默认视为私有应用数据，需要单独加密迁移。
