import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Totally Organic",
  description: "Organic short-form content for D2C brands. *Not organic.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t-2 border-ink">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint sm:px-6">
            <span>
              <span className="text-tomato">*</span>Not organic. Grown in a server rack, picked by you.
            </span>
            <span>Background footage via Pexels</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
