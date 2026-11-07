import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Sakura Chat 🌸 — Branching AI Conversations",
  description: "A kawaii tree-based chat app with auto side-branching powered by Meta AI Muse Spark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable} h-full`}>
      <body className="min-h-full flex flex-col font-body bg-[var(--bg-cream)] text-[var(--ink)] antialiased selection:bg-[var(--pink-main)] selection:text-[var(--ink)]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
