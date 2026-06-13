import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zaans Licht Toernooi",
  description: "Voetbal toernooi systeem door Zaans Licht",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full">
      <body className="min-h-full flex flex-col" style={{ paddingBottom: '2.5rem' }}>
        {children}
        <footer style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: '1px solid var(--border)',
          background: 'rgba(17,17,17,0.96)',
          backdropFilter: 'blur(8px)',
          padding: '0.55rem 1.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          zIndex: 50,
        }}>
          <span style={{
            flexShrink: 0,
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            background: 'var(--orange)',
            color: '#000',
            padding: '2px 7px',
            borderRadius: '4px',
          }}>
            Bèta
          </span>
          <p style={{ fontSize: '0.75rem', color: '#888', margin: 0, lineHeight: 1.4 }}>
            Testfase — software kan fouten bevatten. Zaans Licht aanvaardt <strong style={{ color: '#aaa' }}>geen aansprakelijkheid</strong> voor onjuiste standen of verloren gegevens.
          </p>
        </footer>
      </body>
    </html>
  );
}
