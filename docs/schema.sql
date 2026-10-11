-- =============================================================
-- 英语词根词缀词典 — PostgreSQL Schema (MVP)
-- 依赖扩展: pg_trgm (模糊搜索 / 拼写容错)
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;  -- 可选: 忽略重音符号

-- ----------------------------
-- 单词主表
-- ----------------------------
CREATE TABLE IF NOT EXISTS words (
  id            bigserial   PRIMARY KEY,
  word          text        NOT NULL,
  phonetic      text,
  freq_rank     integer,                       -- 词频排名, 越小越常用
  cefr          text,                          -- A1 A2 B1 B2 C1 C2
  difficulty    smallint    NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  gloss         text,                          -- 构词串讲: '预先(pre-) 说出(dict) → 预言，预测'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_words_word       ON words (word);
CREATE UNIQUE INDEX IF NOT EXISTS uq_words_word_lower ON words (lower(word));
CREATE INDEX IF NOT EXISTS idx_words_freq             ON words (freq_rank NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_words_trgm             ON words USING gin (word gin_trgm_ops);

COMMENT ON COLUMN words.freq_rank  IS '词频排名, 用于同族词与搜索结果默认排序';
COMMENT ON COLUMN words.cefr       IS 'CEFR 等级: A1/A2/B1/B2/C1/C2';
COMMENT ON COLUMN words.difficulty IS '1=易 5=难, 用于筛选; 缺省 3';
COMMENT ON COLUMN words.gloss     IS '构词串讲: 一句话把各词素含义串成单词含义, F3 核心展示内容';

-- ----------------------------
-- 义项与例句
-- ----------------------------
CREATE TABLE IF NOT EXISTS senses (
  id            bigserial PRIMARY KEY,
  word_id       bigint  NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  pos           text,                          -- 词性: n. / v. / adj.
  definition_cn text    NOT NULL,
  definition_en text,
  example       text,
  example_cn    text,
  sort_no       integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_senses_word ON senses (word_id, sort_no);

-- ----------------------------
-- 词素表 (词根 / 前缀 / 后缀 / 词干 / 组合形式)
-- 本表是站点核心资产
-- ----------------------------
CREATE TABLE IF NOT EXISTS morphemes (
  id           bigserial PRIMARY KEY,
  form         text      NOT NULL,             -- 规范书写形式: 'pre-' / '-able' / 'dict'
  slug         text      NOT NULL,             -- URL 友好形式: 'pre' / 'able' / 'dict'
  type         text      NOT NULL CHECK (type IN ('root','prefix','suffix','stem','combining')),
  meaning_cn   text,                           -- 中文含义: '说, 讲, 宣告'
  meaning_en   text,                           -- 英文含义: 'to say, speak, declare'
  origin_lang  text,                           -- 来源语言: L / G / OE / OF / F / PIE
  etymology    text,                           -- 词源说明: '拉丁语 dicere(说)'
  story        text,                           -- 助记故事 / 串讲
  caution      text,                           -- 易混提示: 如 '-able' vs '-ible'
  variants     text[]    NOT NULL DEFAULT '{}',-- 变体形式: {spec,spic}
  word_count   integer   NOT NULL DEFAULT 0,   -- 冗余计数, 导入后回填, 用于热度排序
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_morphemes_form ON morphemes (form);
CREATE UNIQUE INDEX IF NOT EXISTS uq_morphemes_slug ON morphemes (slug);
CREATE INDEX IF NOT EXISTS idx_morphemes_type       ON morphemes (type, word_count DESC);
CREATE INDEX IF NOT EXISTS idx_morphemes_meaning    ON morphemes USING gin (meaning_cn gin_trgm_ops);

COMMENT ON COLUMN morphemes.form      IS '带连字符的规范形式, 用于唯一性识别';
COMMENT ON COLUMN morphemes.slug      IS '去掉连字符的 URL slug';
COMMENT ON COLUMN morphemes.word_count IS '关联单词数, 由导入脚本/触发器回填';

-- ----------------------------
-- 拆解关联表 (核心多对多)
-- ----------------------------
CREATE TABLE IF NOT EXISTS word_morphemes (
  id          bigserial PRIMARY KEY,
  word_id     bigint  NOT NULL REFERENCES words(id)     ON DELETE CASCADE,
  morpheme_id bigint  NOT NULL REFERENCES morphemes(id) ON DELETE CASCADE,
  position    text    CHECK (position IN ('prefix','root','suffix','combining')),
  order_no    integer NOT NULL DEFAULT 0,
  note        text,                            -- 该词素在本词中的具体含义/作用
  UNIQUE (word_id, morpheme_id, order_no)
);

CREATE INDEX IF NOT EXISTS idx_wm_word     ON word_morphemes (word_id, order_no);
CREATE INDEX IF NOT EXISTS idx_wm_morpheme ON word_morphemes (morpheme_id, word_id);

COMMENT ON COLUMN word_morphemes.position IS '该词素在本词中的槽位, 用于前端配色区分';
COMMENT ON COLUMN word_morphemes.note     IS '具体到该词的个性化解释, 非通用含义';

-- ----------------------------
-- 词素之间的关系 (变体 / 相关 / 反义 / 派生)
-- ----------------------------
CREATE TABLE IF NOT EXISTS morpheme_relations (
  id       bigserial PRIMARY KEY,
  from_id  bigint NOT NULL REFERENCES morphemes(id) ON DELETE CASCADE,
  to_id    bigint NOT NULL REFERENCES morphemes(id) ON DELETE CASCADE,
  relation text   NOT NULL CHECK (relation IN ('variant','related','opposite','derived')),
  note     text,
  UNIQUE (from_id, to_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_mrel_from ON morpheme_relations (from_id, relation);
CREATE INDEX IF NOT EXISTS idx_mrel_to   ON morpheme_relations (to_id, relation);

COMMENT ON COLUMN morpheme_relations.relation IS
  'variant=异体(dict/dic/dit); related=相关; opposite=反义(pre-/post-); derived=派生';

-- ----------------------------
-- 标签 (预留: 考试词单 / 主题)
-- ----------------------------
CREATE TABLE IF NOT EXISTS tags (
  id      serial  PRIMARY KEY,
  code    text    NOT NULL,
  name_cn text    NOT NULL,
  kind    text    NOT NULL DEFAULT 'exam' CHECK (kind IN ('exam','topic')),
  sort_no integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_code ON tags (code);

CREATE TABLE IF NOT EXISTS word_tags (
  word_id bigint NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  tag_id  integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (word_id, tag_id)
);

-- ----------------------------
-- 导入批次 (追溯数据来源, 支持按批次回滚)
-- ----------------------------
CREATE TABLE IF NOT EXISTS import_batches (
  id           bigserial   PRIMARY KEY,
  source_file  text        NOT NULL,
  note         text,
  word_count   integer     NOT NULL DEFAULT 0,
  morpheme_count integer   NOT NULL DEFAULT 0,
  report_path  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------
-- 访客 (第二期: 匿名标识, 不收集手机号/邮箱等个人信息)
-- ----------------------------
CREATE TABLE IF NOT EXISTS users (
  id            text        PRIMARY KEY,      -- 匿名访客为浏览器 uuid; 注册用户为 u_<uuid>
  email         text,                          -- 归一化后的小写邮箱, 未注册(匿名访客)为 NULL
  email_verified_at timestamptz,               -- 首次点开邮件链接的时间
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  query_count   integer     NOT NULL DEFAULT 0,  -- 累计查词次数
  ua            text,                            -- 浏览器标识, 仅用于管理端排障
  first_ref     text                             -- 首次来源页
);

-- 存量库补列：CREATE TABLE IF NOT EXISTS 不会给已存在的表追加字段，
-- 因此第三期新增的两列用 ALTER 显式补上（IF NOT EXISTS 保证可重复执行）
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);

COMMENT ON TABLE  users            IS '访客与注册用户: 匿名访客仅 uuid + 行为计数, 注册用户带邮箱';
COMMENT ON COLUMN users.id         IS '匿名访客为 localStorage 中的 uuid; 注册用户为 u_<uuid>, 收藏挂在该 id 上';
COMMENT ON COLUMN users.email      IS '注册邮箱(已小写归一化), 匿名访客为 NULL';
COMMENT ON COLUMN users.query_count IS '累计查词次数, 由 /api/track 累加';

-- ----------------------------
-- 邮箱登录链接 (第三期)
-- ----------------------------
CREATE TABLE IF NOT EXISTS login_tokens (
  id           bigserial   PRIMARY KEY,
  email        text        NOT NULL,               -- 收件邮箱(小写归一化)
  token_hash   text        NOT NULL,               -- 只存 sha256, 明文仅出现在邮件里
  next_path    text,                               -- 登录后回跳的站内路径
  expires_at   timestamptz NOT NULL,               -- 默认 30 分钟
  consumed_at  timestamptz,                        -- 一次性: 用掉即置位
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens(email, created_at DESC);

COMMENT ON TABLE  login_tokens             IS '邮箱登录/注册链接: 一次性 token, 只存哈希';
COMMENT ON COLUMN login_tokens.token_hash  IS 'sha256(明文 token), 泄露库也登不上';
COMMENT ON COLUMN login_tokens.consumed_at IS '非空表示已使用, 再次点击视为失效';

-- ----------------------------
-- 收藏 (第二期)
-- ----------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id    bigint      NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  note       text,
  PRIMARY KEY (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_word ON favorites(word_id, created_at DESC);

COMMENT ON TABLE favorites IS '收藏: 一个用户对同一个词只能收藏一次; 登录后收藏跟随账号';

-- ----------------------------
-- 回填 morphemes.word_count
-- ----------------------------
CREATE OR REPLACE FUNCTION refresh_morpheme_word_count() RETURNS void AS $$
  UPDATE morphemes m
     SET word_count = COALESCE((
       SELECT COUNT(DISTINCT wm.word_id)
         FROM word_morphemes wm
        WHERE wm.morpheme_id = m.id
     ), 0);
$$ LANGUAGE sql;

-- ----------------------------
-- 说明: 本文件全部使用 IF NOT EXISTS, 可安全重复执行,
--       适用于 docker-entrypoint-initdb.d 自动初始化
-- ----------------------------
