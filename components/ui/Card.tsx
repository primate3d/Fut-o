import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-navy-100/80 bg-white p-5 shadow-soft ring-1 ring-white/70 sm:p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
