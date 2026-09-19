"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string; also?: string }[] = [
  { href: "/cards", label: "Harvest" },
  // The label editor (/profile) belongs to the brand label too.
  { href: "/dashboard", label: "Brand label", also: "/profile" },
  { href: "/onboarding", label: "Replant" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2.5 ${className}`}>
      <LeafMark />
      <span className="font-display text-xl font-extrabold leading-none tracking-tight">
        Totally Organic<sup className="ml-0.5 text-tomato">*</sup>
      </span>
    </Link>
  );
}

function LeafMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden className="transition group-hover:-rotate-12">
      <circle cx="16" cy="16" r="15" fill="var(--color-yolk)" stroke="var(--color-ink)" strokeWidth="2" />
      <path d="M9 22c0-8 5-13 14-13-1 9-5 14-13 14" fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 22c3-4 6-7 10-10" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm font-semibold">
          {NAV.map(({ href, label, also }) => {
            const active = path.startsWith(href) || (also !== undefined && path.startsWith(also));
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-full border-2 px-3 py-1.5 transition ${
                  active ? "border-ink bg-ink text-paper" : "border-transparent text-ink-soft hover:border-ink hover:text-ink"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
