import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button className={"rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:opacity-50 " + className} {...props}>{children}</button>;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={"rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(23,43,77,0.06)] " + className}>{children}</section>;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full bg-[#EAF4FC] px-2.5 py-1 text-xs font-bold text-[#0072CE]">{children}</span>;
}