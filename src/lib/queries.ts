/**
 * 数据访问层
 *
 * 约定：
 *   - 全部在 Server Component / Route Handler 内调用，不暴露到客户端
 *   - bigint 主键统一 `::int` 转换后再返回，避免 pg 驱动把 bigint 转成 string
 *   - 模糊搜索与拼写容错依赖 pg_trgm（schema.sql 中已建 gin 索引）
 */

import { query } from '@/db';

// ----------------------------
// 类型
// ----------------------------

export type Sense = {
  id: number;
  pos: string | null;
  definitionCn: string;
  definitionEn: string | null;
  example: string | null;
  exampleCn: string | null;
  sortNo: number;
};

export type BreakdownItem = {
  id: number;
  form: string;
  slug: string;
  type: string;
  meaningCn: string | null;
  meaningEn: string | null;
  originLang: string | null;
  position: string | null;
  orderNo: number;
  note: string | null;
};

export type WordDetail = {
  id: number;
  word: string;
  phonetic: string | null;
  freqRank: number | null;
  cefr: string | null;
  difficulty: number;
  gloss: string | null;
  senses: Sense[];
  breakdown: BreakdownItem[];
};

export type MorphemeDetail = {
  id: number;
  form: string;
  slug: string;
  type: string;
  meaningCn: string | null;
  meaningEn: string | null;
  originLang: string | null;
  etymology: string | null;
  story: string | null;
  caution: string | null;
  variants: string[];
  wordCount: number;
};

export type FamilyWord = {
  id: number;
  word: string;
  phonetic: string | null;
  freqRank: number | null;
  cefr: string | null;
  difficulty: number;
  matchedForm: string;
  matchedSlug: string;
  isDirect: boolean;
  brief: string | null;
};

export type MorphemeListItem = {
  id: number;
  form: string;
  slug: string;
  type: string;
  meaningCn: string | null;
  originLang: string | null;
  wordCount: number;
};

/**
 * 原生 SQL 返回的是数据库列名（snake_case），需显式转成前端 camelCase。
 * 不做自动转换，避免隐式约定导致的字段对不上。
 */
function toMorphemeListItem(r: {
  id: number;
  form: string;
  slug: string;
  type: string;
  meaning_cn: string | null;
  origin_lang: string | null;
  word_count: number;
}): MorphemeListItem {
  return {
    id: r.id,
    form: r.form,
    slug: r.slug,
    type: r.type,
    meaningCn: r.meaning_cn,
    originLang: r.origin_lang,
    wordCount: r.word_count,
  };
}

export type SuggestItem = {
  word: string;
  phonetic: string | null;
  /** 中文反查时命中的义项释义；英文检索为 null */
  definitionCn?: string | null;
};

export type SiteStats = {
  wordCount: number;
  morphemeCount: number;
  breakdownCount: number;
  analyzableWordCount: number;
};

// ----------------------------
// 单词详情（F2 / F3 / F8）
// ----------------------------

/** 按单词取详情，含义项与拆解；未收录返回 null */
export async function getWord(word: string): Promise<WordDetail | null> {
  const { rows } = await query<{
    id: number;
    word: string;
    phonetic: string | null;
    freq_rank: number | null;
    cefr: string | null;
    difficulty: number;
    gloss: string | null;
  }>(
    `SELECT id::int, word, phonetic, freq_rank, cefr, difficulty, gloss
       FROM words
      WHERE lower(word) = lower($1)
      LIMIT 1`,
    [word],
  );

  if (rows.length === 0) return null;

  const w = rows[0];

  const [senseRows, breakdownRows] = await Promise.all([
    query<{
      id: number;
      pos: string | null;
      definition_cn: string;
      definition_en: string | null;
      example: string | null;
      example_cn: string | null;
      sort_no: number;
    }>(
      `SELECT id::int, pos, definition_cn, definition_en, example, example_cn, sort_no
         FROM senses
        WHERE word_id = $1
        ORDER BY sort_no, id`,
      [w.id],
    ),
    query<{
      id: number;
      form: string;
      slug: string;
      type: string;
      meaning_cn: string | null;
      meaning_en: string | null;
      origin_lang: string | null;
      position: string | null;
      order_no: number;
      note: string | null;
    }>(
      `SELECT m.id::int, m.form, m.slug, m.type, m.meaning_cn, m.meaning_en, m.origin_lang,
              wm.position, wm.order_no, wm.note
         FROM word_morphemes wm
         JOIN morphemes m ON m.id = wm.morpheme_id
        WHERE wm.word_id = $1
        ORDER BY wm.order_no, m.form`,
      [w.id],
    ),
  ]);

  return {
    id: w.id,
    word: w.word,
    phonetic: w.phonetic,
    freqRank: w.freq_rank,
    cefr: w.cefr,
    difficulty: w.difficulty,
    gloss: w.gloss,
    senses: senseRows.rows.map((s) => ({
      id: s.id,
      pos: s.pos,
      definitionCn: s.definition_cn,
      definitionEn: s.definition_en,
      example: s.example,
      exampleCn: s.example_cn,
      sortNo: s.sort_no,
    })),
    breakdown: breakdownRows.rows.map((b) => ({
      id: b.id,
      form: b.form,
      slug: b.slug,
      type: b.type,
      meaningCn: b.meaning_cn,
      meaningEn: b.meaning_en,
      originLang: b.origin_lang,
      position: b.position,
      orderNo: b.order_no,
      note: b.note,
    })),
  };
}

/** 取若干高频且已拆解的单词，用于首页推荐 */
export async function getFeaturedWords(limit = 8) {
  const { rows } = await query<{
    id: number;
    word: string;
    phonetic: string | null;
    gloss: string | null;
    freq_rank: number | null;
  }>(
    `SELECT w.id::int, w.word, w.phonetic, w.gloss, w.freq_rank
       FROM words w
      WHERE EXISTS (SELECT 1 FROM word_morphemes wm WHERE wm.word_id = w.id)
      ORDER BY w.freq_rank NULLS LAST, w.word
      LIMIT $1`,
    [limit],
  );
  return rows;
}

// ----------------------------
// 搜索（F1）
// ----------------------------

export type SearchWordItem = {
  id: number;
  word: string;
  phonetic: string | null;
  freqRank: number | null;
  sim: number;
  /** 中文反查时命中的义项释义；英文检索为 null */
  matchedCn: string | null;
  /** 命中义项的词性 */
  matchedPos: string | null;
};

export type SearchResults = {
  words: SearchWordItem[];
  morphemes: MorphemeListItem[];
};

/**
 * 是否含汉字（含扩展区与兼容区）。
 * 用于分流：含汉字走「中文释义反查单词」，否则走英文拼写检索。
 * 中文无法参与 pg_trgm 的英文拼写容错，混在一起只会拖慢且无结果。
 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function hasCJK(s: string): boolean {
  return CJK_RE.test(s);
}

/**
 * 释义里「恰好等于查询词」的判定。
 *
 * definition_cn 形如 '减少, 减轻, 减弱'，用逗号分隔多个译法。
 * 子串匹配会把「减轻」也带出来，排序上要把独立成项的译法排前面。
 */
const EXACT_SENSE_SQL = `(
    s.definition_cn = $1
    OR s.definition_cn LIKE $1 || ',%'
    OR s.definition_cn LIKE '%,' || $1 || '%'
  )`;

/** 英文检索：精确 > 前缀 > trigram 拼写容错（predct → predict） */
async function searchWordsByForm(term: string, limit: number): Promise<SearchWordItem[]> {
  const { rows } = await query<{
    id: number;
    word: string;
    phonetic: string | null;
    freq_rank: number | null;
    sim: number;
  }>(
    `SELECT id::int, word, phonetic, freq_rank,
            similarity(word, $1) AS sim
       FROM words
      WHERE word % $1
         OR lower(word) LIKE lower($1) || '%'
      ORDER BY (lower(word) = lower($1)) DESC,
               sim DESC,
               freq_rank NULLS LAST,
               word
      LIMIT $2`,
    [term, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    phonetic: r.phonetic,
    freqRank: r.freq_rank,
    sim: Number(r.sim),
    matchedCn: null,
    matchedPos: null,
  }));
}

/**
 * 中文反查单词：按义项的中文释义匹配，例如「预测」→ predict / forecast。
 *
 * 一个词有多个义项，用 DISTINCT ON (w.id) 每个词只保留最相关的那一条，
 * 否则同词会重复出现占满结果位。
 */
async function searchWordsByCn(term: string, limit: number): Promise<SearchWordItem[]> {
  const { rows } = await query<{
    id: number;
    word: string;
    phonetic: string | null;
    freq_rank: number | null;
    matched_cn: string;
    matched_pos: string | null;
  }>(
    `SELECT * FROM (
        SELECT DISTINCT ON (w.id)
               w.id::int   AS id,
               w.word,
               w.phonetic,
               w.freq_rank,
               s.definition_cn AS matched_cn,
               s.pos           AS matched_pos,
               ${EXACT_SENSE_SQL} AS exact
          FROM senses s
          JOIN words w ON w.id = s.word_id
         WHERE s.definition_cn ILIKE '%' || $1 || '%'
         ORDER BY w.id, exact DESC, s.sort_no
       ) t
       ORDER BY t.exact DESC, t.freq_rank NULLS LAST, t.word
       LIMIT $2`,
    [term, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    phonetic: r.phonetic,
    freqRank: r.freq_rank,
    sim: 1,
    matchedCn: r.matched_cn,
    matchedPos: r.matched_pos,
  }));
}

/**
 * 混合搜索：
 *   - 含汉字 → 中文释义反查单词
 *   - 否则   → 单词（精确 > 前缀 > 拼写容错）
 * 词素区两条路都走（形式匹配 + 中文含义反查）
 */
export async function searchAll(q: string, limit = 20): Promise<SearchResults> {
  const term = q.trim();
  if (!term) return { words: [], morphemes: [] };

  const [words, morphemes] = await Promise.all([
    hasCJK(term) ? searchWordsByCn(term, limit) : searchWordsByForm(term, limit),
    listMorphemesByTerm(term, limit),
  ]);

  return { words, morphemes };
}

/** 词素检索：形式匹配 + 中文含义反查（搜「说」能发现 dict） */
async function listMorphemesByTerm(term: string, limit: number): Promise<MorphemeListItem[]> {
  // 词素形式都是拉丁字母，中文输入走 trigram 只会白扫一遍
  const fuzzy = hasCJK(term) ? 'FALSE' : '(length($1) >= 3 AND form % $1)';

  const { rows } = await query<{
    id: number;
    form: string;
    slug: string;
    type: string;
    meaning_cn: string | null;
    origin_lang: string | null;
    word_count: number;
  }>(
    `SELECT id::int, form, slug, type, meaning_cn, origin_lang, word_count
       FROM morphemes
      WHERE lower(form) LIKE '%' || lower($1) || '%'
         OR (meaning_cn IS NOT NULL AND meaning_cn ILIKE '%' || $1 || '%')
         OR ${fuzzy}
      ORDER BY (lower(form) = lower($1)) DESC,
               word_count DESC,
               form
      LIMIT $2`,
    [term, limit],
  );

  return rows.map(toMorphemeListItem);
}

/** 搜索建议，下拉补全用。中文输入时按义项释义反查单词 */
export async function suggest(q: string, limit = 10): Promise<SuggestItem[]> {
  const term = q.trim();
  if (!term) return [];

  if (hasCJK(term)) {
    const { rows } = await query<{
      word: string;
      phonetic: string | null;
      definition_cn: string;
    }>(
      `SELECT t.word, t.phonetic, t.matched_cn AS definition_cn
         FROM (
           SELECT DISTINCT ON (w.id)
                  w.id, w.word, w.phonetic, w.freq_rank,
                  s.definition_cn AS matched_cn,
                  ${EXACT_SENSE_SQL} AS exact
             FROM senses s
             JOIN words w ON w.id = s.word_id
            WHERE s.definition_cn ILIKE '%' || $1 || '%'
            ORDER BY w.id, exact DESC, s.sort_no
         ) t
        ORDER BY t.exact DESC, t.freq_rank NULLS LAST, t.word
        LIMIT $2`,
      [term, limit],
    );
    return rows;
  }

  const { rows } = await query<{ word: string; phonetic: string | null }>(
    `SELECT word, phonetic
       FROM words
      WHERE lower(word) LIKE lower($1) || '%'
      ORDER BY freq_rank NULLS LAST, word
      LIMIT $2`,
    [term, limit],
  );

  if (rows.length > 0) return rows;

  // 无前缀命中时退回拼写容错
  const { rows: fuzzy } = await query<{ word: string; phonetic: string | null }>(
    `SELECT word, phonetic
       FROM words
      WHERE length($1) >= 3 AND word % $1
      ORDER BY similarity(word, $1) DESC, freq_rank NULLS LAST
      LIMIT $2`,
    [term, limit],
  );
  return fuzzy;
}

// ----------------------------
// 词素详情与同族词（F4 / F5 / F7）
// ----------------------------

export async function getMorpheme(slug: string): Promise<MorphemeDetail | null> {
  const { rows } = await query<{
    id: number;
    form: string;
    slug: string;
    type: string;
    meaning_cn: string | null;
    meaning_en: string | null;
    origin_lang: string | null;
    etymology: string | null;
    story: string | null;
    caution: string | null;
    variants: string[];
    word_count: number;
  }>(
    `SELECT id::int, form, slug, type, meaning_cn, meaning_en, origin_lang,
            etymology, story, caution, variants, word_count
       FROM morphemes
      WHERE slug = $1
      LIMIT 1`,
    [slug],
  );

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    id: r.id,
    form: r.form,
    slug: r.slug,
    type: r.type,
    meaningCn: r.meaning_cn,
    meaningEn: r.meaning_en,
    originLang: r.origin_lang,
    etymology: r.etymology,
    story: r.story,
    caution: r.caution,
    variants: r.variants ?? [],
    wordCount: r.word_count,
  };
}

/** 取该词素的变体（双向 variant 关系） */
export async function getVariants(morphemeId: number): Promise<MorphemeListItem[]> {
  const { rows } = await query<{
    id: number;
    form: string;
    slug: string;
    type: string;
    meaning_cn: string | null;
    origin_lang: string | null;
    word_count: number;
  }>(
    `SELECT m.id::int, m.form, m.slug, m.type, m.meaning_cn, m.origin_lang, m.word_count
       FROM morpheme_relations r
       JOIN morphemes m ON m.id = CASE WHEN r.from_id = $1 THEN r.to_id ELSE r.from_id END
      WHERE r.relation = 'variant'
        AND (r.from_id = $1 OR r.to_id = $1)
      ORDER BY m.word_count DESC, m.form`,
    [morphemeId],
  );
  return rows.map(toMorphemeListItem);
}

/** 取相关 / 反义词素 */
export async function getRelated(morphemeId: number): Promise<{
  relation: string;
  items: MorphemeListItem[];
}[]> {
  const { rows } = await query<{
    relation: string;
    id: number;
    form: string;
    slug: string;
    type: string;
    meaning_cn: string | null;
    origin_lang: string | null;
    word_count: number;
  }>(
    `SELECT r.relation,
            m.id::int, m.form, m.slug, m.type, m.meaning_cn, m.origin_lang, m.word_count
       FROM morpheme_relations r
       JOIN morphemes m ON m.id = r.to_id
      WHERE r.from_id = $1
        AND r.relation IN ('related', 'opposite', 'derived')
      ORDER BY r.relation, m.word_count DESC, m.form`,
    [morphemeId],
  );

  const grouped = new Map<string, MorphemeListItem[]>();
  for (const r of rows) {
    const list = grouped.get(r.relation) ?? [];
    list.push({
      id: r.id,
      form: r.form,
      slug: r.slug,
      type: r.type,
      meaningCn: r.meaning_cn,
      originLang: r.origin_lang,
      wordCount: r.word_count,
    });
    grouped.set(r.relation, list);
  }
  return [...grouped].map(([relation, items]) => ({ relation, items }));
}

/**
 * 同族词（F5 + F7）：包含该词素及其全部变体词素下的单词。
 * is_direct = true 表示直接命中该词素，false 表示经由变体命中。
 */
export async function getFamilyWords(slug: string, limit = 50): Promise<FamilyWord[]> {
  const { rows } = await query<{
    id: number;
    word: string;
    phonetic: string | null;
    freq_rank: number | null;
    cefr: string | null;
    difficulty: number;
    matched_form: string;
    matched_slug: string;
    is_direct: boolean;
    brief: string | null;
  }>(
    `WITH root AS (
       SELECT id FROM morphemes WHERE slug = $1
     ),
     target AS (
       SELECT id FROM root
       UNION
       SELECT to_id   FROM morpheme_relations WHERE relation = 'variant' AND from_id = (SELECT id FROM root)
       UNION
       SELECT from_id FROM morpheme_relations WHERE relation = 'variant' AND to_id   = (SELECT id FROM root)
     )
     SELECT w.id::int, w.word, w.phonetic, w.freq_rank, w.cefr, w.difficulty,
            m.form AS matched_form, m.slug AS matched_slug,
            (m.id = (SELECT id FROM root)) AS is_direct,
            (SELECT string_agg(s.definition_cn, '；' ORDER BY s.sort_no)
               FROM senses s WHERE s.word_id = w.id) AS brief
       FROM word_morphemes wm
       JOIN words w     ON w.id = wm.word_id
       JOIN morphemes m ON m.id = wm.morpheme_id
      WHERE wm.morpheme_id IN (SELECT id FROM target)
      ORDER BY is_direct DESC, w.freq_rank NULLS LAST, w.word
      LIMIT $2`,
    [slug, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    phonetic: r.phonetic,
    freqRank: r.freq_rank,
    cefr: r.cefr,
    difficulty: r.difficulty,
    matchedForm: r.matched_form,
    matchedSlug: r.matched_slug,
    isDirect: r.is_direct,
    brief: r.brief,
  }));
}

// ----------------------------
// 词素总览（F6）
// ----------------------------

export type MorphemeFilters = {
  type?: string;
  origin?: string;
  letter?: string;
};

export async function listMorphemes(
  filters: MorphemeFilters = {},
  limit = 500,
): Promise<MorphemeListItem[]> {
  const { type, origin, letter } = filters;

  const { rows } = await query<{
    id: number;
    form: string;
    slug: string;
    type: string;
    meaning_cn: string | null;
    origin_lang: string | null;
    word_count: number;
  }>(
    `SELECT id::int, form, slug, type, meaning_cn, origin_lang, word_count
       FROM morphemes
      WHERE ($1::text IS NULL OR type = $1)
        AND ($2::text IS NULL OR origin_lang = $2)
        AND ($3::text IS NULL OR lower(left(form, 1)) = lower($3))
      ORDER BY word_count DESC, form
      LIMIT $4`,
    [type ?? null, origin ?? null, letter ?? null, limit],
  );

  return rows.map(toMorphemeListItem);
}

/** 总览页筛选项的可选值（来源语言分布） */
export async function listOrigins(): Promise<{ code: string; count: number }[]> {
  const { rows } = await query<{ code: string; count: number }>(
    `SELECT origin_lang AS code, count(*)::int AS count
       FROM morphemes
      WHERE origin_lang IS NOT NULL
      GROUP BY origin_lang
      ORDER BY count DESC`,
  );
  return rows;
}

// ----------------------------
// 站点统计
// ----------------------------

export async function getStats(): Promise<SiteStats> {
  const { rows } = await query<{
    word_count: number;
    morpheme_count: number;
    breakdown_count: number;
    analyzable_word_count: number;
  }>(
    `SELECT (SELECT count(*)::int FROM words)             AS word_count,
            (SELECT count(*)::int FROM morphemes)         AS morpheme_count,
            (SELECT count(*)::int FROM word_morphemes)    AS breakdown_count,
            (SELECT count(DISTINCT word_id)::int FROM word_morphemes) AS analyzable_word_count`,
  );
  const r = rows[0];
  return {
    wordCount: r.word_count,
    morphemeCount: r.morpheme_count,
    breakdownCount: r.breakdown_count,
    analyzableWordCount: r.analyzable_word_count,
  };
}

/** sitemap 用：全部已收录单词（仅取词形） */
export async function listAllWords(): Promise<string[]> {
  const { rows } = await query<{ word: string }>(`SELECT word FROM words ORDER BY word`);
  return rows.map((r) => r.word);
}

/** sitemap 用：全部词素 slug */
export async function listAllMorphemeSlugs(): Promise<string[]> {
  const { rows } = await query<{ slug: string }>(
    `SELECT slug FROM morphemes ORDER BY slug`,
  );
  return rows.map((r) => r.slug);
}

// ----------------------------
// 同族词推荐（单词页底部）
// ----------------------------

export type RelatedWord = {
  id: number;
  word: string;
  phonetic: string | null;
  freqRank: number | null;
  matchedForm: string;
  matchedSlug: string;
  brief: string | null;
};

/**
 * 取与目标单词「共享任意词素」的其他单词，按词频排序。
 * 用于单词详情页底部的同族词推荐。
 */
export async function getRelatedWords(wordId: number, limit = 12): Promise<RelatedWord[]> {
  const { rows } = await query<{
    id: number;
    word: string;
    phonetic: string | null;
    freq_rank: number | null;
    matched_form: string;
    matched_slug: string;
    brief: string | null;
  }>(
    `WITH target AS (
       SELECT DISTINCT morpheme_id FROM word_morphemes WHERE word_id = $1
     ),
     dedup AS (
       SELECT DISTINCT ON (w.id)
              w.id, w.word, w.phonetic, w.freq_rank,
              m.form AS matched_form, m.slug AS matched_slug
         FROM word_morphemes wm
         JOIN words w     ON w.id = wm.word_id
         JOIN morphemes m ON m.id = wm.morpheme_id
        WHERE wm.morpheme_id IN (SELECT morpheme_id FROM target)
          AND w.id <> $1
        ORDER BY w.id, m.form
     )
     SELECT d.id::int, d.word, d.phonetic, d.freq_rank,
            d.matched_form, d.matched_slug,
            (SELECT string_agg(s.definition_cn, '；' ORDER BY s.sort_no)
               FROM senses s WHERE s.word_id = d.id) AS brief
       FROM dedup d
      ORDER BY d.freq_rank NULLS LAST, d.word
      LIMIT $2`,
    [wordId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    phonetic: r.phonetic,
    freqRank: r.freq_rank,
    matchedForm: r.matched_form,
    matchedSlug: r.matched_slug,
    brief: r.brief,
  }));
}

