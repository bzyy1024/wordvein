-- =============================================================
-- PostgreSQL 建扩展脚本
--
-- 用法：由宿主机脚本执行，作用于外部数据库实例
--   pnpm db:init          # scripts/db-init.mjs 会执行本文件 + docs/schema.sql
--
-- 说明：compose 不部署数据库容器，因此不再走
--       /docker-entrypoint-initdb.d 挂载；本文件全为 IF NOT EXISTS，可重复执行。
-- =============================================================

-- pg_trgm：三元组相似度，用于 F1 拼写容错检索（predct -> predict）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent：忽略重音符号，便于检索 résumé / resume
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 建表语句见挂载的 02-schema.sql（即 docs/schema.sql）
-- 本文件只负责扩展，避免两份 DDL 互相覆盖
