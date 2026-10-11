#!/usr/bin/env bash
# =============================================================
# PostgreSQL 备份脚本（外部数据库实例）
#
# 用法：
#   ./docker/postgres/backup.sh
#   BACKUP_DIR=/mnt/nas/ew-backup RETENTION_DAYS=30 ./docker/postgres/backup.sh
#
# 加入 crontab（每天凌晨 3 点）：
#   0 3 * * * cd /srv/english-word && ./docker/postgres/backup.sh >> /var/log/ew-backup.log 2>&1
#
# 依赖：宿主机安装与服务器同版本的 pg_dump（大版本不一致会拒绝导出）
# =============================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# 连接串：优先用环境变量，其次从 .env 读取（compose 不再部署 db 容器）
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
: "${DATABASE_URL:?未设置 DATABASE_URL（请在 .env 中配置外部数据库连接串）}"

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/roots-$TS.dump"

echo "[backup] 开始备份 -> $OUT"

# -Fc：自定义格式，可用 pg_restore 选择性恢复
if pg_dump "$DATABASE_URL" -Fc >"$OUT"; then
  SIZE="$(du -h "$OUT" | cut -f1)"
  echo "[backup] 完成：$OUT ($SIZE)"
else
  echo "[backup] 备份失败" >&2
  rm -f "$OUT"
  exit 1
fi

# 清理过期备份
if [ "$RETENTION_DAYS" -gt 0 ]; then
  DELETED="$(find "$BACKUP_DIR" -name 'roots-*.dump' -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
  echo "[backup] 已清理过期备份：$DELETED 个（保留 ${RETENTION_DAYS} 天）"
fi
