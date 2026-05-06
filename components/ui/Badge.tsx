import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = {
  children: ReactNode;
  tone?: "green" | "blue" | "amber" | "neutral";
};

const tones = {
  green: "border-sage-500/20 bg-sage-100 text-sage-700",
  blue: "border-navy-100 bg-navy-50 text-navy-700",
  amber: "border-amber-200 bg-amber-100 text-amber-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-700"
};

export function Badge({ children, tone = "blue" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold leading-none",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
