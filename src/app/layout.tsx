import "./globals.css";
import type { Metadata } from "next";
import { Inter, Newsreader, JetBrains_Mono } from "next/font/google";
import SessionGuard from "@/components/session-guard";
import { ToastProvider } from "@/components/shared/Toast";
import { SWRProvider } from "@/components/SWRProvider";

// Three-role type system (see globals.css's design tokens, "Round 2
// revamp"): Inter for dense UI/body text (legibility at small sizes is
// what a data-heavy CRM actually needs), Newsreader (italic) for page/
// section titles -- a service-manual heading register instead of another
// humanist grotesk, deliberately NOT the violet/rounded-corner SaaS look
// round 1 picked -- JetBrains Mono for anything tabular: invoice/job
// numbers, amounts, IDs -- so columns of digits actually line up (paired
// with font-variant-numeric: tabular-nums at the component level).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["italic", "normal"], variable: "--font-display", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

// Public-facing product name is "My Biz Flow" -- AN-CRM is this repo's
// internal name only, never shown to an outside visitor (browser tab
// title, search results, social share previews all read this).
export const metadata: Metadata = {
  title: "My Biz Flow",
  description: "The CRM/ERP platform for Brand, Service Center, and POS operations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable} ${inter.className}`}>
        <SWRProvider>
          <ToastProvider>
            <SessionGuard />
            {children}
          </ToastProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
