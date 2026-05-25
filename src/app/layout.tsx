import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zaans Licht Toernooi",
  description: "Voetbal toernooi systeem door Zaans Licht",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
