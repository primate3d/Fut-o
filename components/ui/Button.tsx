import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
};

const variants = {
  primary:
    "bg-navy-900 text-white shadow-sm hover:bg-navy-700 active:bg-navy-900",
  secondary:
    "border border-sage-500/25 bg-sage-100 text-navy-900 hover:border-sage-500/40 hover:bg-sage-500/20 active:bg-sage-100",
  ghost:
    "bg-transparent text-navy-900 hover:bg-navy-50 active:bg-navy-100/70"
};

export function Button({
  href,
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold leading-none transition focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    className
  );

  if (href) {
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
