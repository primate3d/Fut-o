import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ProgressStepsProps = {
  steps: string[];
  currentStep: number;
  completedStep?: number;
};

export function ProgressSteps({
  steps,
  currentStep,
  completedStep = 0
}: ProgressStepsProps) {
  return (
    <ol className="grid gap-2 rounded-xl border border-navy-100/80 bg-white p-3 shadow-soft sm:grid-cols-3 lg:grid-cols-6">
      {steps.map((step, index) => {
        const isDone = index < completedStep;
        const isCurrent = index === currentStep;

        return (
          <li
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-lg border p-3 text-sm transition",
              isCurrent
                ? "border-sage-500/50 bg-sage-50 text-navy-900"
                : "border-transparent bg-transparent text-slate-600"
            )}
            key={step}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                isDone
                  ? "bg-sage-500 text-white"
                  : isCurrent
                    ? "bg-white text-sage-700 ring-2 ring-sage-500/30"
                    : "bg-navy-50 text-navy-700"
              )}
            >
              {isDone ? <Check size={15} /> : index + 1}
            </span>
            <span className="font-medium">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
