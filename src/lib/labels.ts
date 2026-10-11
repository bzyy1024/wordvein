/** 展示用标签映射（页面与组件统一引用，避免散落的硬编码） */

/** 词素类型 */
export const TYPE_LABEL: Record<string, string> = {
  root: '词根',
  prefix: '前缀',
  suffix: '后缀',
  stem: '词干',
  combining: '组合形式',
};

/** 来源语言代码 */
export const ORIGIN_LABEL: Record<string, string> = {
  L: '拉丁语',
  G: '希腊语',
  OE: '古英语',
  OF: '古法语',
  F: '法语',
  PIE: '原始印欧语',
  ME: '中古英语',
};

/** 难度 1~5 */
export const DIFFICULTY_LABEL: Record<number, string> = {
  1: '入门',
  2: '简单',
  3: '中等',
  4: '较难',
  5: '困难',
};

/** 词素关系 */
export const RELATION_LABEL: Record<string, string> = {
  variant: '变体',
  related: '相关',
  opposite: '反义',
  derived: '派生',
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function originLabel(code: string | null): string {
  if (!code) return '';
  return ORIGIN_LABEL[code] ?? code;
}

export function difficultyLabel(level: number): string {
  return DIFFICULTY_LABEL[level] ?? '中等';
}

export function relationLabel(relation: string): string {
  return RELATION_LABEL[relation] ?? relation;
}

/**
 * 展示用词形：数据源用尾部编号区分同形词素（-ate1 / a-2 / ev (aev)），
 * 编号只用于数据库区分条目，展示时必须去掉。
 * 注意：链接跳转仍要用 slug，不能改。
 */
export function cleanForm(form: string): string {
  return String(form ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/([a-z-])[0-9]+$/i, '$1')
    .trim();
}
