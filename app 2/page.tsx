export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🐾</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          강쥐엄마 결제 페이지
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280' }}>
          이 페이지는 강쥐엄마 앱 내부에서 사용돼요.
        </p>
      </div>
    </main>
  );
}
