// 뉴스·AI 어댑터 실 API 검증 (W4) — 네이버·Finnhub 뉴스 + OpenAI 요약·감성.
// 키는 .env.local 환경변수에서 읽음(검증 전용 — 앱 런타임은 설정 화면 DB 키 사용).
// 실행: npm run verify:news
import './_bootstrap';

import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NaverClient } from '../lib/providers/naver/client';
import { getNaverNews } from '../lib/providers/naver/news';
import { FinnhubClient } from '../lib/providers/finnhub/client';
import { getFinnhubNews } from '../lib/providers/finnhub/news';
// summarize.ts는 'server-only'라 CLI에서 import 불가 → 프롬프트만 가져와 직접 호출
import { newsSummarySchema, newsSummaryPrompt, NEWS_SUMMARY_SYSTEM } from '../lib/ai/prompts/news-summary.v1';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function main() {
  console.log('— 뉴스·AI 어댑터 실 API 검증 —\n');
  const naverId = process.env.NAVER_CLIENT_ID;
  const naverSecret = process.env.NAVER_CLIENT_SECRET;
  const finnhubKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY;
  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  console.log(`[env] NAVER=${!!(naverId && naverSecret)} FINNHUB=${!!finnhubKey} OPENAI=${!!openaiKey}`);

  let sample: { title: string; body?: string | null } | null = null;

  // 1) 네이버 뉴스 (한국)
  if (naverId && naverSecret) {
    try {
      const news = await getNaverNews(new NaverClient({ clientId: naverId, clientSecret: naverSecret }), '삼성전자', 5);
      console.log(`✅ 네이버(삼성전자): ${news.length}건`);
      if (news[0]) {
        console.log(`   최신: ${news[0].title} · ${news[0].publishedAt?.slice(0, 10)}`);
        sample = { title: news[0].title, body: news[0].body };
      }
    } catch (e) {
      console.error(`❌ 네이버: ${msg(e)}`);
    }
  } else {
    console.log('⏭️  네이버 키 없음 (env NAVER_CLIENT_ID/NAVER_CLIENT_SECRET)');
  }

  // 2) Finnhub 뉴스 (미국)
  if (finnhubKey) {
    try {
      const news = await getFinnhubNews(new FinnhubClient(finnhubKey), 'AAPL');
      console.log(`✅ Finnhub(AAPL): ${news.length}건`);
      if (news[0]) {
        console.log(`   최신: ${news[0].title} · ${news[0].publishedAt?.slice(0, 10)}`);
        if (!sample) sample = { title: news[0].title, body: news[0].body };
      }
    } catch (e) {
      console.error(`❌ Finnhub: ${msg(e)}`);
    }
  } else {
    console.log('⏭️  Finnhub 키 없음');
  }

  // 3) OpenAI 요약·감성
  if (openaiKey && sample) {
    try {
      const openai = createOpenAI({ apiKey: openaiKey });
      const { object: r } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: newsSummarySchema,
        system: NEWS_SUMMARY_SYSTEM,
        prompt: newsSummaryPrompt(sample),
      });
      console.log(`✅ AI 요약·감성 [${r.sentiment}]: ${r.summary}`);
    } catch (e) {
      console.error(`❌ AI 요약: ${msg(e)}`);
    }
  } else {
    console.log(`⏭️  AI 요약 건너뜀 (OPENAI 키=${!!openaiKey}, 샘플=${!!sample})`);
  }

  console.log('\n— 검증 종료 —');
}

// RateLimiter unref 타이머로 인한 CLI 조기 종료 방지 (verify-fundamentals와 동일)
const keepAlive = setInterval(() => {}, 2_147_483_647);
main().finally(() => clearInterval(keepAlive));
