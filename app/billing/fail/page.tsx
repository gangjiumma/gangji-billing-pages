'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// 친화 메시지 매핑
const FRIENDLY_MESSAGES: Record<string, string> = {
  PAY_PROCESS_CANCELED: '결제 진행을 취소하셨어요.',
  PAY_PROCESS_ABORTED: '결제가 도중에 중단되었어요. 다시 시도해주세요.',
  REJECT_CARD_COMPANY: '카드사에서 결제를 거절했어요. 다른 카드로 시도해주세요.',
  INVALID_CARD_NUMBER: '카드 번호가 올바르지 않아요.',
  INVALID_CARD_INFO: '카드 정보가 올바르지 않아요.',
  NOT_AVAILABLE_BANK: '카드사 점검 시간이에요. 잠시 후 다시 시도해주세요.',
  CARD_EXPIRED: '카드 유효기간이 만료되었어요.',
  EXCEED_MAX_AMOUNT: '결제 한도를 초과했어요.',
  NOT_REGISTERED_BUSINESS: '등록되지 않은 가맹점이에요.',
  EXCEED_MAX_AUTH_COUNT: '인증 시도 횟수를 초과했어요. 잠시 후 다시 시도해주세요.',
  USER_CANCEL: '결제를 취소하셨어요.',
};

export default function BillingFailPage() {
  const params = useSearchParams();
  const errorCode = params.get('code') || 'UNKNOWN';
  const errorMessageRaw = params.get('message') || '알 수 없는 오류가 발생했어요.';

  const friendly = FRIENDLY_MESSAGES[errorCode];
  const displayMessage = friendly || errorMessageRaw;

  // RN WebView로 알림 (자동)
  useEffect(() => {
    const notify = () => {
      try {
        if (
          typeof window !== 'undefined' &&
          (window as any).ReactNativeWebView?.postMessage
        ) {
          (window as any).ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'BILLING_AUTH_FAIL',
              code: errorCode,
              message: displayMessage,
            }),
          );
        }
      } catch (e) {
        console.error('postMessage failed:', e);
      }
    };

    notify();
    const t = setTimeout(notify, 200);
    return () => clearTimeout(t);
  }, [errorCode, displayMessage]);

  // 사용자 명시적으로 돌아가기
  const handleGoBack = () => {
    try {
      if (
        typeof window !== 'undefined' &&
        (window as any).ReactNativeWebView?.postMessage
      ) {
        (window as any).ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'BILLING_AUTH_USER_CANCEL',
            code: errorCode,
            message: displayMessage,
          }),
        );
      }
    } catch (e) {
      console.error('postMessage failed:', e);
    }
  };

  return (
    <main style={styles.container}>
      <div style={styles.icon}>😢</div>
      <h1 style={styles.title}>카드 등록을 못 했어요</h1>
      <p style={styles.subtitle}>
        잠깐의 문제일 수 있어요.
        <br />
        다시 시도하시거나 다른 카드로 등록해보세요.
      </p>

      <div style={styles.errorBox}>
        <div style={styles.errorCode}>{errorCode}</div>
        <div style={styles.errorMessage}>{displayMessage}</div>
      </div>

      <button style={styles.button} onClick={handleGoBack}>
        앱으로 돌아가기
      </button>
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
    maxWidth: 480,
    margin: '0 auto',
  },
  icon: {
    fontSize: 72,
    marginBottom: 20,
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
  },
  errorBox: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    textAlign: 'left',
    width: '100%',
  },
  errorCode: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: 700,
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  errorMessage: {
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 1.5,
  },
  button: {
    width: '100%',
    padding: 16,
    background: '#FF6B35',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
  },
};
