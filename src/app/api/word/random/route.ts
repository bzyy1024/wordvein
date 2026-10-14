import { NextResponse } from 'next/server';
import { getRandomWord } from '@/lib/queries';

/**
 * 随机单词（首页「每日一词」随机换一个）
 * GET /api/word/random?exclude=predict
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exclude = searchParams.get('exclude') ?? undefined;

  try {
    const word = await getRandomWord(exclude ?? undefined);
    if (!word) {
      return NextResponse.json({ word: null }, { status: 404 });
    }
    return NextResponse.json({ word });
  } catch (error) {
    console.error('[api/word/random]', error);
    return NextResponse.json({ word: null, error: '查询失败' }, { status: 500 });
  }
}
