// 기간별 수익률은 투자 기록 탭의 [수익 분석]으로 옮겨졌다(D21). 기존 링크·북마크 호환용 리다이렉트.
import { redirect } from 'next/navigation';

export default function PerformancePage() {
  redirect('/journal?tab=analysis');
}
