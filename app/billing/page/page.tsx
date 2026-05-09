'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

// ─────────────────────────────────────────
// Edge Function URL (DB 조회용)
// ─────────────────────────────────────────
const EDGE_FUNCTION_BASE =
  'https://druwwrpunuxpvjbsrcls.supabase.co/functions/v1/gangji-billing';

// ─────────────────────────────────────────
// 7/15 룰 — 가입 시점 기준 메시지 분기
// KST 2026-07-15 23:59:59까지 등록한 사용자: "7/31까지 무료" 메시지
// 그 이후 등록자: "14일 무료체험" 메시지
// ─────────────────────────────────────────
const PRE_LAUNCH_DEADLINE_KST = new Date('2026-07-15T23:59:59+09:00').getTime();
const isPreLaunchPeriod = () => Date.now() <= PRE_LAUNCH_DEADLINE_KST;

// 토스 SDK 타입
declare global {
  interface Window {
    TossPayments: any;
  }
}

interface PlanInfo {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  features: Record<string, any> | null;
  is_active: boolean;
  release_label: string | null;
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
function BillingPageContent() {
  const params = useSearchParams();
  const customerKey = params.get('customerKey') || '';
  const orderId = params.get('orderId') || '';
  const planId = params.get('plan') || 'lite';

  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

  // 7/15 룰 메시지 분기 (마운트 시 한 번 결정)
  const preLaunch = isPreLaunchPeriod();

  // 1. DB에서 플랜 정보 가져오기
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        setPlanLoading(true);
        const res = await fetch(
          `${EDGE_FUNCTION_BASE}/get-plan-info?plan=${planId}`,
        );
        const data = await res.json();

        if (!data.ok || !data.plan) {
          throw new Error(data.message || '플랜 정보를 가져오지 못했어요');
        }

        setPlanInfo(data.plan);
      } catch (err) {
        console.error('plan fetch error:', err);
        setError(
          err instanceof Error
            ? err.message
            : '플랜 정보를 불러오는 중 오류가 발생했어요. 다시 시도해주세요.',
        );
      } finally {
        setPlanLoading(false);
      }
    };

    fetchPlan();
  }, [planId]);

  // 2. 파라미터 검증
  useEffect(() => {
    if (!customerKey || !orderId) {
      setError('필수 정보가 누락되었어요. 앱에서 다시 시도해주세요.');
    } else if (!clientKey) {
      setError('결제 시스템이 설정되지 않았어요. 운영자에게 문의해주세요.');
    }
  }, [customerKey, orderId, clientKey]);

  // 3. 토스 SDK 로드 감지
  useEffect(() => {
    const check = setInterval(() => {
      if (typeof window !== 'undefined' && window.TossPayments) {
        setSdkReady(true);
        clearInterval(check);
      }
    }, 100);

    return () => clearInterval(check);
  }, []);

  // 4. 카드 등록 요청
  const handleRequest = async () => {
    if (!customerKey || !orderId || !clientKey) {
      setError('필수 정보가 누락되었어요. 앱을 다시 시도해주세요.');
      return;
    }

    if (!sdkReady) {
      setError('결제 시스템 준비 중이에요. 잠시 후 다시 시도해주세요.');
      return;
    }

    if (!planInfo) {
      setError('플랜 정보를 아직 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tossPayments = window.TossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });

      const origin = window.location.origin;
      const successUrl = `${origin}/billing/success`;
      const failUrl = `${origin}/billing/fail`;

      // ⭐ v17 fix: customerEmail / customerName 완전히 제거
      // 토스 v2 SDK는 빈 문자열을 INVALID_REQUEST로 거부하는 경우가 있어
      // 사용자 정보 없이는 옵션 객체에 아예 포함하지 않는 게 안전
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl,
        failUrl,
      });
    } catch (err: any) {
      console.error('requestBillingAuth error:', err);

      // ⭐ v17 fix: 진짜 에러 코드/메시지 사용자에게 노출 (디버깅용)
      let errMsg = '결제창을 여는 중 오류가 발생했어요.';
      if (err?.code) {
        errMsg += `\n[${err.code}]`;
      }
      if (err?.message) {
        errMsg += ` ${err.message}`;
      }

      // 사용자가 닫기를 누른 경우는 에러로 표시 X
      if (err?.code === 'USER_CANCEL') {
        setError(null);
      } else {
        setError(errMsg + '\n\n다시 시도해주세요.');
      }
      setLoading(false);
    }
  };

  // ─── 플랜 정보 로딩 중 ───
  if (planLoading) {
    return (
      <main style={styles.container}>
        <div style={styles.logo}>🐾</div>
        <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 40 }}>
          플랜 정보를 확인하고 있어요...
        </p>
      </main>
    );
  }

  // ─── 플랜 정보 없음 (에러) ───
  if (!planInfo) {
    return (
      <main style={styles.container}>
        <div style={styles.logo}>😢</div>
        <h1 style={styles.title}>플랜 정보를 불러올 수 없어요</h1>
        <p style={styles.subtitle}>잠시 후 다시 시도해주세요.</p>
        {error && <div style={styles.errorBox}>⚠️ {error}</div>}
      </main>
    );
  }

  // 7/15 룰 메시지 결정
  const trialTitle = preLaunch
    ? '🎉 7월 31일까지 100% 무료!'
    : '🎁 14일 무료체험 시작';
  const trialDesc = preLaunch
    ? '8월 1일부터 자동결제가 시작돼요.'
    : '14일 후 자동결제가 시작돼요.';

  return (
    <main style={styles.container}>
      <div style={styles.logo}>🐾</div>
      <h1 style={styles.title}>결제 카드 등록</h1>
      <p style={styles.subtitle}>
        구독을 시작하기 위해 카드를 등록해요.
        <br />
        {trialDesc}
      </p>

      <div style={styles.infoBox}>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>선택 플랜</span>
          <span style={styles.infoValue}>{planInfo.name}</span>
        </div>
        <div style={{ ...styles.infoRow, ...styles.infoRowDivider }}>
          <span style={styles.infoLabel}>월 구독료</span>
          <span style={{ ...styles.infoValue, ...styles.infoValueBrand }}>
            {planInfo.price_monthly.toLocaleString()}원
          </span>
        </div>
        <div style={{ ...styles.infoRow, ...styles.infoRowDivider }}>
          <span style={styles.infoLabel}>무료 체험</span>
          <span style={styles.infoValue}>
            {preLaunch ? '7/31까지' : '14일'}
          </span>
        </div>
      </div>

      {/* ⭐ v17: 7/15 룰 메시지 분기 */}
      <div style={preLaunch ? styles.noticeBrand : styles.notice}>
        <div style={styles.noticeTitle}>{trialTitle}</div>
        <div style={styles.noticeBody}>
          {preLaunch ? (
            <>
              • 지금 등록해도 결제는 8월 1일부터 시작돼요
              <br />
              • 카드 정보는 토스페이먼츠 보안 서버에 안전하게 보관돼요
              <br />
              • 언제든 구독을 취소할 수 있어요
            </>
          ) : (
            <>
              • 카드 등록 후 14일 동안 모든 기능 무료 이용
              <br />
              • 14일 후 자동으로 월 구독료가 결제돼요
              <br />
              • 카드 정보는 토스페이먼츠 보안 서버에 안전하게 보관돼요
              <br />
              • 언제든 구독을 취소할 수 있어요
            </>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      <button
        style={{
          ...styles.button,
          ...(loading || !sdkReady ? styles.buttonDisabled : {}),
        }}
        onClick={handleRequest}
        disabled={loading || !sdkReady || !!error}
      >
        {loading
          ? '결제창을 여는 중...'
          : !sdkReady
          ? '결제 시스템 준비 중...'
          : '카드 등록하고 시작하기'}
      </button>

      <div style={styles.bottomSpacer} />
    </main>
  );
}

// ─────────────────────────────────────────
// 외부 export — Suspense
// ─────────────────────────────────────────
export default function BillingPage() {
  return (
    <>
      <Script
        src="https://js.tosspayments.com/v2/standard"
        strategy="afterInteractive"
      />
      <Suspense fallback={<LoadingFallback />}>
        <BillingPageContent />
      </Suspense>
    </>
  );
}

function LoadingFallback() {
  return (
    <main style={styles.loadingContainer}>
      <div style={styles.logo}>🐾</div>
      <p style={{ fontSize: 14, color: '#6B7280' }}>로딩 중...</p>
    </main>
  );
}

// ─────────────────────────────────────────
// 인라인 스타일
// ─────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '32px 20px 20px 20px',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    textAlign: 'center',
  },
  logo: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    textAlign: 'center',
    marginBottom: 8,
    color: '#111827',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 1.5,
  },
  infoBox: {
    background: '#FFFBF7',
    border: '1px solid #FFE4CC',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  infoRowDivider: {
    borderTop: '1px solid rgba(255, 228, 204, 0.5)',
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: 500,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: 700,
  },
  infoValueBrand: {
    color: '#FF6B35',
    fontSize: 18,
    fontWeight: 800,
  },
  // ⭐ v17: pre-launch (7/15 이전) 강조 박스
  noticeBrand: {
    background: '#FFF4E6',
    border: '1.5px solid #FFCDB8',
    borderRadius: 14,
    padding: '16px 18px',
    marginBottom: 20,
    color: '#374151',
    lineHeight: 1.7,
  },
  // 일반 (14일 무료체험)
  notice: {
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: 14,
    padding: '16px 18px',
    marginBottom: 20,
    color: '#374151',
    lineHeight: 1.7,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: '#FF6B35',
    marginBottom: 8,
  },
  noticeBody: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 1.7,
  },
  button: {
    width: '100%',
    padding: 18,
    background: '#FF6B35',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  buttonDisabled: {
    background: '#D1D5DB',
    cursor: 'not-allowed',
  },
  errorBox: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    color: '#DC2626',
    fontSize: 13,
    whiteSpace: 'pre-wrap', // 에러 메시지 줄바꿈 처리
  },
  bottomSpacer: {
    height: 'env(safe-area-inset-bottom, 24px)',
    minHeight: 24,
  },
};
