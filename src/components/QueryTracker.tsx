'use client';

import { useEffect } from 'react';
import { track } from '@/lib/visitor';

/**
 * 查词上报（第二期）
 *
 * 打开单词详情页即视为一次查词，用于管理端统计活跃度与热门词趋势。
 * 只上报单词本身，不关联任何个人信息。
 */
export default function QueryTracker({ word }: { word: string }) {
  useEffect(() => {
    track('query', `/word/${word}`);
  }, [word]);

  return null;
}
