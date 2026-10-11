import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * 数据库 Schema（Drizzle ORM 描述）
 *
 * ⚠️ 权威定义仍为 docs/schema.sql：
 *    - 首次建库由 Docker 挂载 schema.sql 自动执行
 *    - 本文件与 schema.sql 必须保持字段一致，改动时需同步两边
 *    - drizzle-kit 仅用于本地生成迁移，不要用它覆盖 schema.sql
 */

// ----------------------------
// 单词主表
// ----------------------------
export const words = pgTable(
  'words',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    word: text('word').notNull(),
    phonetic: text('phonetic'),
    /** 词频排名，越小越常用；同族词与搜索结果默认按此排序 */
    freqRank: integer('freq_rank'),
    /** CEFR 等级：A1/A2/B1/B2/C1/C2 */
    cefr: text('cefr'),
    /** 1=易 5=难，缺省 3 */
    difficulty: smallint('difficulty').notNull().default(3),
    /**
     * 构词串讲：一句话把各词素含义串成单词含义。
     * 例：'预先(pre-) 说出(dict) → 预言，预测'
     * 这是 F3「整体含义推理」的展示内容，也是本站区别于普通词典的关键字段。
     */
    gloss: text('gloss'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqWord: uniqueIndex('uq_words_word').on(t.word),
    uqWordLower: uniqueIndex('uq_words_word_lower').on(sql`lower(${t.word})`),
    idxFreq: index('idx_words_freq').on(t.freqRank),
    /** 拼写容错检索（F1）依赖此索引 */
    idxTrgm: index('idx_words_trgm').using('gin', sql`${t.word} gin_trgm_ops`),
    difficultyCheck: check('words_difficulty_check', sql`${t.difficulty} BETWEEN 1 AND 5`),
  }),
);

// ----------------------------
// 义项与例句
// ----------------------------
export const senses = pgTable(
  'senses',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    wordId: bigint('word_id', { mode: 'number' })
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    /** 词性：n. / v. / adj. / adv. ... 无数据时为 null */
    pos: text('pos'),
    definitionCn: text('definition_cn').notNull(),
    definitionEn: text('definition_en'),
    example: text('example'),
    exampleCn: text('example_cn'),
    sortNo: integer('sort_no').notNull().default(0),
  },
  (t) => ({
    idxWord: index('idx_senses_word').on(t.wordId, t.sortNo),
  }),
);

// ----------------------------
// 词素表（核心资产：词根 / 前缀 / 后缀 / 词干 / 组合形式）
// ----------------------------
export const morphemes = pgTable(
  'morphemes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** 带连字符的规范形式：'pre-' / '-able' / 'dict' */
    form: text('form').notNull(),
    /** URL slug：保留连字符以区分 root/prefix/suffix（如 ac / ac- / -ac） */
    slug: text('slug').notNull(),
    type: text('type').notNull(),
    meaningCn: text('meaning_cn'),
    meaningEn: text('meaning_en'),
    /** L / G / OE / OF / F / PIE / ME */
    originLang: text('origin_lang'),
    etymology: text('etymology'),
    story: text('story'),
    caution: text('caution'),
    /** 变体形式：{spec, spic} */
    variants: text('variants').array().notNull().default(sql`'{}'::text[]`),
    /** 关联单词数，导入后由 refresh_morpheme_word_count() 回填 */
    wordCount: integer('word_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqForm: uniqueIndex('uq_morphemes_form').on(t.form),
    uqSlug: uniqueIndex('uq_morphemes_slug').on(t.slug),
    idxType: index('idx_morphemes_type').on(t.type, t.wordCount),
    /** 中文含义反查（F1）依赖此索引 */
    idxMeaning: index('idx_morphemes_meaning').using('gin', sql`${t.meaningCn} gin_trgm_ops`),
    typeCheck: check(
      'morphemes_type_check',
      sql`${t.type} IN ('root','prefix','suffix','stem','combining')`,
    ),
  }),
);

// ----------------------------
// 拆解关联表（核心多对多）
// ----------------------------
export const wordMorphemes = pgTable(
  'word_morphemes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    wordId: bigint('word_id', { mode: 'number' })
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    morphemeId: bigint('morpheme_id', { mode: 'number' })
      .notNull()
      .references(() => morphemes.id, { onDelete: 'cascade' }),
    /** 槽位：prefix / root / suffix / combining，用于前端配色 */
    position: text('position'),
    /** 拼接顺序 */
    orderNo: integer('order_no').notNull().default(0),
    /** 该词素在本词中的具体含义（差异化内容） */
    note: text('note'),
  },
  (t) => ({
    idxWord: index('idx_wm_word').on(t.wordId, t.orderNo),
    idxMorpheme: index('idx_wm_morpheme').on(t.morphemeId, t.wordId),
    uq: uniqueIndex('uq_wm_word_morpheme_order').on(t.wordId, t.morphemeId, t.orderNo),
    posCheck: check(
      'wm_position_check',
      sql`${t.position} IN ('prefix','root','suffix','combining')`,
    ),
  }),
);

// ----------------------------
// 词素之间关系（变体 / 相关 / 反义 / 派生）
// ----------------------------
export const morphemeRelations = pgTable(
  'morpheme_relations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fromId: bigint('from_id', { mode: 'number' })
      .notNull()
      .references(() => morphemes.id, { onDelete: 'cascade' }),
    toId: bigint('to_id', { mode: 'number' })
      .notNull()
      .references(() => morphemes.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull(),
    note: text('note'),
  },
  (t) => ({
    idxFrom: index('idx_mrel_from').on(t.fromId, t.relation),
    idxTo: index('idx_mrel_to').on(t.toId, t.relation),
    uq: uniqueIndex('uq_mrel_from_to_relation').on(t.fromId, t.toId, t.relation),
    relCheck: check(
      'mrel_relation_check',
      sql`${t.relation} IN ('variant','related','opposite','derived')`,
    ),
  }),
);

// ----------------------------
// 标签（考试词单 / 主题）
// ----------------------------
export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    /** zk / gk / cet4 / cet6 / ky / ielts / toefl / gre */
    code: text('code').notNull(),
    nameCn: text('name_cn').notNull(),
    kind: text('kind').notNull().default('exam'),
    sortNo: integer('sort_no').notNull().default(0),
  },
  (t) => ({
    uqCode: uniqueIndex('uq_tags_code').on(t.code),
    kindCheck: check('tags_kind_check', sql`${t.kind} IN ('exam','topic')`),
  }),
);

export const wordTags = pgTable(
  'word_tags',
  {
    wordId: bigint('word_id', { mode: 'number' })
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.wordId, t.tagId] }),
  }),
);

// ----------------------------
// 访客与注册用户（第二期：匿名标识；第三期：邮箱注册）
// ----------------------------
export const users = pgTable(
  'users',
  {
    /**
     * 匿名访客为浏览器端生成的 uuid；注册用户为 `u_<uuid>`。
     * favorites.user_id 指向这里，登录后收藏挂在注册用户上。
     */
    id: text('id').primaryKey(),
    /** 注册邮箱（已小写归一化）；匿名访客为 null */
    email: text('email'),
    /** 首次点开邮件链接（完成验证）的时间 */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** 累计查词次数，由 /api/track 累加 */
    queryCount: integer('query_count').notNull().default(0),
    /** 浏览器标识，仅用于管理端排障 */
    ua: text('ua'),
    /** 首次来源页 */
    firstRef: text('first_ref'),
  },
  (t) => ({
    idxLastSeen: index('idx_users_last_seen').on(t.lastSeenAt),
    /** 一个邮箱只能注册一次；匿名访客 email 为 null，不冲突 */
    uqEmail: uniqueIndex('uq_users_email').on(t.email),
  }),
);

// ----------------------------
// 邮箱登录 / 注册链接（第三期）
// ----------------------------
export const loginTokens = pgTable(
  'login_tokens',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** 收件邮箱（小写归一化） */
    email: text('email').notNull(),
    /** 只存 sha256(token)，明文仅出现在邮件链接里 */
    tokenHash: text('token_hash').notNull(),
    /** 登录后回跳的站内路径 */
    nextPath: text('next_path'),
    /** 默认 30 分钟过期 */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 一次性：非空表示已使用 */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxEmail: index('idx_login_tokens_email').on(t.email, t.createdAt),
  }),
);

// ----------------------------
// 收藏（第二期：匿名；第三期：登录后可跨设备）
// ----------------------------
export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: bigint('word_id', { mode: 'number' })
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.wordId] }),
    idxWord: index('idx_favorites_word').on(t.wordId, t.createdAt),
  }),
);

// ----------------------------
// 导入批次（追溯来源，支持按批次回滚）
// ----------------------------
export const importBatches = pgTable('import_batches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sourceFile: text('source_file').notNull(),
  note: text('note'),
  wordCount: integer('word_count').notNull().default(0),
  morphemeCount: integer('morpheme_count').notNull().default(0),
  reportPath: text('report_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
