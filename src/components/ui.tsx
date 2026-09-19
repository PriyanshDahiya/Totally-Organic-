import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared Totally Organic pieces. Styling lives in Tailwind classes built on
// the tokens in globals.css (paper, ink, leaf, tomato, yolk).

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON: Record<Variant, string> = {
  primary:
    "bg-leaf text-card border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-leaf-deep active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]",
  secondary:
    "bg-card text-ink border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-paper-deep active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]",
  ghost: "text-ink-soft underline decoration-rule decoration-2 underline-offset-4 hover:text-ink hover:decoration-ink",
  danger:
    "bg-tomato text-card border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] hover:brightness-95 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition disabled:pointer-events-none disabled:opacity-50";

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${variant === "ghost" ? "font-medium" : BASE} ${BUTTON[variant]} ${extra}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

// Form fields.
export const field =
  "w-full rounded-lg border-2 border-ink/80 bg-card px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-leaf focus:outline-none focus:ring-4 focus:ring-leaf/20";
export const fieldLabel = "mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft";

// Small monospace label, like the fine print on packaging.
export function FinePrint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint ${className}`}>{children}</p>;
}

// A produce sticker: rounded, slightly rotated, bold.
export function Sticker({
  children,
  tone = "yolk",
  rotate = -3,
  className = "",
}: {
  children: ReactNode;
  tone?: "yolk" | "leaf" | "tomato" | "card";
  rotate?: number;
  className?: string;
}) {
  const tones = {
    yolk: "bg-yolk text-ink",
    leaf: "bg-leaf text-card",
    tomato: "bg-tomato text-card",
    card: "bg-card text-ink",
  };
  return (
    <span
      style={{ transform: `rotate(${rotate}deg)` }}
      className={`inline-block rounded-full border-2 border-ink px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] shadow-[2px_2px_0_var(--color-ink)] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// A circular rubber stamp with text around the edge.
export function Stamp({
  top,
  center,
  bottom,
  tone = "leaf",
  size = 96,
  rotate = -12,
  className = "",
  style,
}: {
  style?: React.CSSProperties;
  top: string;
  center: string;
  bottom: string;
  tone?: "leaf" | "tomato" | "ink";
  size?: number;
  rotate?: number;
  className?: string;
}) {
  const color = { leaf: "var(--color-leaf)", tomato: "var(--color-tomato)", ink: "var(--color-ink)" }[tone];
  const id = `stamp-${top}-${bottom}`.replace(/\W/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ ...style, transform: `rotate(${rotate}deg)`, color }}
      className={`shrink-0 ${className}`}
      aria-label={`${top} ${center} ${bottom}`}
      role="img"
    >
      <defs>
        <path id={`${id}-t`} d="M 16 50 A 34 34 0 0 1 84 50" />
        <path id={`${id}-b`} d="M 14 50 A 36 36 0 0 0 86 50" />
      </defs>
      {/* Paper backing so the stamp stays legible over photos and video. */}
      <circle cx="50" cy="50" r="47" fill="var(--color-paper)" fillOpacity="0.92" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="1.5" fontFamily="var(--font-mono)">
        <textPath href={`#${id}-t`} startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="1.5" fontFamily="var(--font-mono)">
        <textPath href={`#${id}-b`} startOffset="50%" textAnchor="middle">
          {bottom}
        </textPath>
      </text>
      <text x="50" y="55" textAnchor="middle" fill="currentColor" fontSize="15" fontWeight="800" fontFamily="var(--font-display)">
        {center}
      </text>
    </svg>
  );
}

// Card surface: off-white label stock with an ink border.
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border-2 border-ink bg-card shadow-[4px_4px_0_var(--color-ink)] ${className}`}>{children}</div>;
}

// Section heading with a mono kicker above it.
export function SectionTitle({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <FinePrint>{kicker}</FinePrint>
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{children}</h2>
    </div>
  );
}
