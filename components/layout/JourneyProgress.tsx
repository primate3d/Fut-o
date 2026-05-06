"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProgressSteps } from "@/components/ui/ProgressSteps";
import { siteConfig } from "@/config/site";
import { getStoredMockAnalysis, isAnalysisForDocuments } from "@/features/analysis";
import { getStoredUploadedDocuments } from "@/features/upload/storage";

const stepByPath: Record<string, number> = {
  "/importer": 1,
  "/analyse": 2,
  "/resultats": 3,
  "/courriers": 4,
  "/rapport": 5
};

export function JourneyProgress() {
  const pathname = usePathname();
  const currentStep = stepByPath[pathname] ?? 0;
  const [completedStep, setCompletedStep] = useState(0);

  useEffect(() => {
    const documents = getStoredUploadedDocuments();
    const analysis = getStoredMockAnalysis();
    const hasUsableDocuments = documents.some((document) => document.status !== "error");
    const hasAnalysis = isAnalysisForDocuments(analysis, documents);

    if (!hasUsableDocuments) {
      setCompletedStep(0);
      return;
    }

    if (!hasAnalysis) {
      setCompletedStep(2);
      return;
    }

    setCompletedStep(Math.min(currentStep, 3));
  }, [currentStep, pathname]);

  return (
    <ProgressSteps
      completedStep={completedStep}
      currentStep={currentStep}
      steps={siteConfig.journey}
    />
  );
}
