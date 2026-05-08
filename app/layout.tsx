import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '강쥐엄마 — 결제',
  description: '강쥐엄마 사장님 구독 결제 페이지',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta charSet="UTF-8" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Noto Sans KR', sans-serif",
          background: '#FFFFFF',
          color: '#111827',
        }}
      >
        {children}
      </body>
    </html>
  );
}
