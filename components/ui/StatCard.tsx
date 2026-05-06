import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
};

export function StatCard({ label, value, helper, icon }: StatCardProps) {
  return (
    <Card className="flex min-h-36 items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-3 break-words text-3xl font-bold tracking-tight text-navy-900">
          {value}
        </p>
        {helper ? <p className="mt-2 text-sm leading-5 text-slate-500">{helper}</p> : null}
      </div>
      {icon ? (
        <div className="shrink-0 rounded-lg border border-sage-500/20 bg-sage-100 p-3 text-sage-700">
          {icon}
        </div>
      ) : null}
    </Card>
  );
}
