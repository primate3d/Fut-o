import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: ReactNode;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon
}: EmptyStateProps) {
  return (
    <Card className="flex min-h-72 flex-col items-center justify-center text-center">
      {icon ? (
        <div className="mb-5 rounded-xl border border-navy-100 bg-navy-50 p-3 text-navy-700">
          {icon}
        </div>
      ) : null}
      <h2 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
      {actionLabel && actionHref ? (
        <Button className="mt-6" href={actionHref} variant="secondary">
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}
