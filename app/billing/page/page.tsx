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
// 7/29 룰 — 첫 결제일 기준 메시지 분기
// 정책:
//  - 등록 시점 +14일이 7/29 KST 자정 이전 → 베타 출신 → 7/29 일괄 첫 결제
//  - 등록 시점 +14일이 7/29 KST 자정 이후 → 신규 → 14일 후 첫 결제
// ─────────────────────────────────────────
const JULY_29_2026_KST = new Date('2026-07-29T00:00:00+09:00').getTime();
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// 지금 카드 등록하면 7/29 룰을 적용받는지 여부
// (등록 시점 +14일이 7/29 이전이면 베타 출신 → 7/29 결제)
const isPreLaunchPeriod = () => (Date.now() + FOURTEEN_DAYS_MS) < JULY_29_2026_KST;

// 지금 등록하면 첫 결제일이 언제인지 KST 'M월 D일' 형식으로 반환
const computeFirstChargeLabel = (): string => {
  const now = Date.now();
  const trialEnd = now + FOURTEEN_DAYS_MS;
  if (trialEnd < JULY_29_2026_KST) {
    return '7월 29일';
  }
  const d = new Date(trialEnd);
  // KST 변환
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};

// 무료체험 종료 라벨 (베타 출신 = '7월 28일까지', 신규 = '14일')
const computeTrialEndLabel = (): string => {
  const now = Date.now();
  const trialEnd = now + FOURTEEN_DAYS_MS;
  if (trialEnd < JULY_29_2026_KST) {
    return '7월 28일까지';
  }
  return '14일';
};

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
  const [debugInfo, setDebugInfo] = useState<string | null>(null); // ⭐ v17: 디버그 정보
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

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
    setDebugInfo(null);

    // ⭐ v17 fix: 디버깅용 — 호출 직전 상태 모두 캡쳐
    const debugBefore = {
      clientKey: clientKey.slice(0, 20) + '...',
      customerKey: customerKey.slice(0, 12) + '...',
      orderId: orderId.slice(0, 30) + '...',
      origin: window.location.origin,
      sdkReady,
      planInfo: planInfo.id,
      userAgent: navigator.userAgent.slice(0, 80),
    };
    console.log('[Billing] before requestBillingAuth:', debugBefore);

    try {
      const tossPayments = window.TossPayments(clientKey);
      console.log('[Billing] tossPayments instance:', tossPayments);

      const payment = tossPayments.payment({ customerKey });
      console.log('[Billing] payment instance:', payment);

      const origin = window.location.origin;
      const successUrl = `${origin}/billing/success`;
      const failUrl = `${origin}/billing/fail`;

      // ⭐ v17 fix: customerEmail / customerName 더미값으로 채워넣기
      // 공식 샘플 코드도 더미값을 넣음 (https://velog.io/@yoonvelog/...)
      // 빈 문자열로 두면 일부 환경에서 INVALID_REQUEST 발생
      // 실제 사용자 이메일/이름이 없는 경우 식별 가능한 더미값 사용
      const requestPayload = {
        method: 'CARD' as const,
        successUrl,
        failUrl,
        customerEmail: 'customer@gangji-mama.com',  // 더미 이메일
        customerName: '강쥐엄마 회원',                 // 더미 이름
      };
      console.log('[Billing] requestPayload:', requestPayload);

      await payment.requestBillingAuth(requestPayload);

      // 여기 도달하면 successUrl로 리다이렉트되거나 결제창 닫힘
      console.log('[Billing] requestBillingAuth resolved (창이 닫힘)');
    } catch (err: any) {
      console.error('[Billing] requestBillingAuth error:', err);
      console.error('[Billing] error keys:', Object.keys(err || {}));
      console.error('[Billing] error.code:', err?.code);
      console.error('[Billing] error.message:', err?.message);
      console.error('[Billing] error.name:', err?.name);
      console.error('[Billing] error.stack:', err?.stack?.slice(0, 200));

      // ⭐ v17 fix: 진짜 에러 정보 노출 (디버깅용 — 화면에 펼쳐 보임)
      const errorDetails = [
        `code: ${err?.code || 'N/A'}`,
        `name: ${err?.name || 'N/A'}`,
        `message: ${err?.message || 'N/A'}`,
        `origin: ${window.location.origin}`,
      ].join('\n');
      setDebugInfo(errorDetails);

      let errMsg = '결제창을 여는 중 오류가 발생했어요.';
      if (err?.code) {
        errMsg += `\n[${err.code}]`;
      }
      if (err?.message) {
        errMsg += ` ${err.message}`;
      }

      if (err?.code === 'USER_CANCEL') {
        setError(null);
        setDebugInfo(null);
      } else {
        setError(errMsg);
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

  // ─── 플랜 정보 없음 ───
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

  const firstChargeLabel = computeFirstChargeLabel(); // '7월 29일' or '8월 5일' 같은 동적 라벨
  const trialEndLabel = computeTrialEndLabel();       // '7월 28일까지' or '14일'

  const trialTitle = preLaunch
    ? `🎉 ${firstChargeLabel}까지 100% 무료!`
    : '🎁 14일 무료체험 시작';
  const trialDesc = preLaunch
    ? `${firstChargeLabel}부터 자동결제가 시작돼요.`
    : `${firstChargeLabel}부터 자동결제가 시작돼요.`;

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
            {trialEndLabel}
          </span>
        </div>
      </div>

      <div style={preLaunch ? styles.noticeBrand : styles.notice}>
        <div style={styles.noticeTitle}>{trialTitle}</div>
        <div style={styles.noticeBody}>
          {preLaunch ? (
            <>
              • 지금 등록해도 결제는 {firstChargeLabel}부터 시작돼요
              <br />
              • 카드 정보는 토스페이먼츠 보안 서버에 안전하게 보관돼요
              <br />
              • 언제든 구독을 취소할 수 있어요
            </>
          ) : (
            <>
              • 14일 동안 모든 기능 무료 이용
              <br />
              • {firstChargeLabel}에 자동으로 월 구독료가 결제돼요
              <br />
              • 카드 정보는 토스페이먼츠 보안 서버에 안전하게 보관돼요
              <br />
              • 언제든 구독을 취소할 수 있어요
            </>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      {/* ⭐ v17: 디버그 정보 박스 — 에러 발생 시 자세한 정보 표시 */}
      {debugInfo && (
        <details style={styles.debugBox}>
          <summary style={styles.debugSummary}>🔍 디버그 정보 (눌러서 펼치기)</summary>
          <pre style={styles.debugPre}>{debugInfo}</pre>
        </details>
      )}

      {/* 약관 동의 + 환불정책 안내 */}
      <div style={styles.termsBox}>
        카드 등록 시 강쥐엄마의{' '}
        <a
          href="https://gangjiumma.kr/terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.termsLink}
        >
          이용약관
        </a>
        {' '}및{' '}
        <a
          href="https://gangjiumma.kr/refund-policy"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.termsLink}
        >
          환불정책
        </a>
        에 동의하는 것으로 간주됩니다.
      </div>

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
  noticeBrand: {
    background: '#FFF4E6',
    border: '1.5px solid #FFCDB8',
    borderRadius: 14,
    padding: '16px 18px',
    marginBottom: 20,
    color: '#374151',
    lineHeight: 1.7,
  },
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
    whiteSpace: 'pre-wrap',
  },
  debugBox: {
    background: '#FFFBEB',
    border: '1px solid #FCD34D',
    borderRadius: 10,
    padding: '8px 12px',
    marginBottom: 16,
    fontSize: 12,
    color: '#78350F',
  },
  debugSummary: {
    cursor: 'pointer',
    fontWeight: 700,
    padding: '4px 0',
    userSelect: 'none',
  },
  debugPre: {
    margin: '8px 0 0 0',
    padding: '8px',
    background: '#FEF3C7',
    borderRadius: 6,
    fontSize: 11,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  bottomSpacer: {
    height: 'env(safe-area-inset-bottom, 24px)',
    minHeight: 24,
  },
  termsBox: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 1.6,
    textAlign: 'center' as const,
    marginBottom: 14,
    padding: '0 8px',
  },
  termsLink: {
    color: '#FF6B35',
    fontWeight: 700,
    textDecoration: 'underline',
  },
};
