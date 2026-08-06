'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function BillingSuccessContent() {
  const params = useSearchParams();
  const authKey = params.get('authKey');
  const customerKey = params.get('customerKey');
  const plan = params.get('plan') || '';
  const returnTo = params.get('returnTo') || '';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rnWebView = (window as any).ReactNativeWebView;

    // ── ① 앱(WebView): 기존 그대로 authKey를 앱에 넘김 ──
    if (rnWebView?.postMessage) {
      const notify = () => {
        try {
          rnWebView.postMessage(
            JSON.stringify({
              type: 'BILLING_AUTH_SUCCESS',
              authKey,
              customerKey,
            }),
          );
        } catch (e) {
          console.error('postMessage failed:', e);
        }
      };
      notify();
      const t = setTimeout(notify, 200);
      return () => clearTimeout(t);
    }

    // ── ② 웹(PC·태블릿): 대시보드로 돌려보냄 ──
    //    빌링키 발급은 대시보드가 로그인 세션(Bearer)으로 처리한다.
    //    (이 페이지엔 세션이 없어 Edge /issue-billing-key 를 직접 못 부름)
    if (!returnTo || !authKey || !customerKey) {
      console.error('[billing/success] web-mode 파라미터 누락', { returnTo, authKey, customerKey });
      return;
    }
    try {
      const url = new URL(returnTo);
      url.searchParams.set('billing', 'pending');
      url.searchParams.set('authKey', authKey);
      url.searchParams.set('customerKey', customerKey);
      if (plan) url.searchParams.set('plan', plan);
      window.location.replace(url.toString());
    } catch (e) {
      console.error('[billing/success] returnTo 파싱 실패:', e);
    }
  }, [authKey, customerKey, plan, returnTo]);

  return (
    <main style={styles.container}>
      <div style={styles.icon}>✅</div>
      <h1 style={styles.title}>카드 인증 완료</h1>
      <p style={styles.subtitle}>
        안전하게 카드 정보를 등록 중이에요.
        <br />
        잠시만 기다려주세요...
      </p>
      <div style={styles.spinner} />
      <style>{`
        @keyframes pop {
          0% { transform: scale(0); }
          80% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BillingSuccessContent />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <main style={styles.container}>
      <div style={{ fontSize: 56 }}>🐾</div>
      <p style={{ fontSize: 14, color: '#6B7280' }}>로딩 중...</p>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
    textAlign: 'center',
  },
  icon: {
    fontSize: 72,
    marginBottom: 20,
    animation: 'pop 0.4s ease-out',
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: '#111827',
    marginBottom: 12,
    margin: '0 0 12px 0',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 1.5,
    marginBottom: 24,
    maxWidth: 480,
  },
  spinner: {
    display: 'inline-block',
    width: 32,
    height: 32,
    border: '3px solid #FFE4CC',
    borderTopColor: '#FF6B35',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginTop: 12,
  },
};
