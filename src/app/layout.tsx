import "./globals.css";
import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import SessionGuard from "@/components/session-guard";
import { ToastProvider } from "@/components/shared/Toast";
import { SWRProvider } from "@/components/SWRProvider";

// Three-role type system (see globals.css's design tokens):
// Inter for dense UI/body text (legibility at small sizes is what a
// data-heavy CRM actually needs), Manrope for page titles/headings (a
// humanist grotesk with more character than Inter, used sparingly so it
// reads as considered rather than a second body font), JetBrains Mono for
// anything tabular -- invoice/job numbers, amounts, IDs -- so columns of
// digits actually line up (paired with font-variant-numeric: tabular-nums
// at the component level).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "AN-CRM",
  description: "The CRM/ERP platform for Brand, Service Center, and POS operations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable} ${inter.className}`}>
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
