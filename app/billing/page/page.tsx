'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

// ─────────────────────────────────────────
// Edge Function URL (DB 조회용)
// ─────────────────────────────────────────
const EDGE_FUNCTION_BASE =
  'https://druwwrpunuxpvjbsrcls.supabase.co/functions/v1/gangji-billing';

// 토스 SDK 타입
declare global {
  interface Window {
    TossPayments: any;
  }
}

// 플랜 정보 타입 (DB 응답)
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

  // 1. DB에서 플랜 정보 가져오기 (마운트 시)
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

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl,
        failUrl,
        customerEmail: '',
        customerName: '',
      });
    } catch (err) {
      console.error('requestBillingAuth error:', err);
      setError('결제창을 여는 중 오류가 발생했어요. 다시 시도해주세요.');
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

  return (
    <main style={styles.container}>
      <div style={styles.logo}>🐾</div>
      <h1 style={styles.title}>결제 카드 등록</h1>
      <p style={styles.subtitle}>
        구독 결제를 위해 카드를 등록해요.
        <br />
        8월 1일부터 자동결제가 시작돼요.
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
          <span style={styles.infoLabel}>무료 체험 기간</span>
          <span style={styles.infoValue}>14일 무료</span>
        </div>
      </div>

      <div style={styles.notice}>
        💡 <b>지금 등록해도 결제는 8월 1일부터 시작돼요.</b>
        <br />
        • 8월 1일 이전에 가입하시면 7/31까지 전부 무료
        <br />
        • 카드 정보는 토스페이먼츠 보안 서버에 안전하게 저장돼요
        <br />
        • 언제든 구독을 취소할 수 있어요
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
// 인라인 스타일 (v3와 동일)
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
  notice: {
    background: '#F9FAFB',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 20,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 1.6,
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
  },
  bottomSpacer: {
    height: 'env(safe-area-inset-bottom, 24px)',
    minHeight: 24,
  },
};
