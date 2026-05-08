'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function BillingSuccessPage() {
  const params = useSearchParams();
  const authKey = params.get('authKey');
  const customerKey = params.get('customerKey');

  // RN WebView로 알림
  useEffect(() => {
    const notify = () => {
      try {
        if (
          typeof window !== 'undefined' &&
          (window as any).ReactNativeWebView?.postMessage
        ) {
          (window as any).ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'BILLING_AUTH_SUCCESS',
              authKey,
              customerKey,
            }),
          );
        }
      } catch (e) {
        console.error('postMessage failed:', e);
      }
    };

    notify();
    // 안드로이드에서 onNavigationStateChange 늦게 발화하는 케이스 대비
    const t = setTimeout(notify, 200);
    return () => clearTimeout(t);
  }, [authKey, customerKey]);

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
      <style jsx>{`
        @keyframes pop {
          0% {
            transform: scale(0);
          }
          80% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
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
