'use client';

import { useEffect } from 'react';
import { track } from '@/lib/visitor';

/**
 * 访问上报（第二期）
 *
 * 挂在根布局里，每次会话上报一次 visit，用于管理端统计活跃访客。
 * 不渲染任何内容，也不参与布局。
 */
export default function VisitorTracker() {
  useEffect(() => {
    track('visit', window.location.pathname);
  }, []);

  return null;
}
