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
// title, search results, social share previews all read this). Brand and
// POS vendor types were removed from the product entirely -- this
// metadata (and every visible marketing string) previously still
// mentioned both, reported live ("no where Brand and POS should be there
// even in title and meta data"). Rewritten around the single real
// vertical (service centers/repair shops) with actual search-intent
// keywords instead of generic platform language, for organic + AI-answer
// (GEO) discovery.
const SITE_URL = "https://crm.angroup.in";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "My Biz Flow — Service Center & Repair Shop Management Software",
    template: "%s | My Biz Flow",
  },
  description:
    "Run your entire repair/service center on one screen: workorders, GST billing, inventory, staff, and customer repair tracking. Built for mobile, electronics, and appliance service centers in India.",
  keywords: [
    "service center management software",
    "repair shop software India",
    "workorder management system",
    "mobile repair shop software",
    "GST billing software for service centers",
    "customer repair tracking",
    "service center CRM",
    "repair shop invoicing software",
  ],
  applicationName: "My Biz Flow",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "My Biz Flow",
    title: "My Biz Flow — Service Center & Repair Shop Management Software",
    description:
      "Run your entire repair/service center on one screen: workorders, GST billing, inventory, staff, and customer repair tracking.",
  },
  twitter: {
    card: "summary_large_image",
    title: "My Biz Flow — Service Center & Repair Shop Management Software",
    description:
      "Run your entire repair/service center on one screen: workorders, GST billing, inventory, staff, and customer repair tracking.",
  },
  robots: { index: true, follow: true },
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
