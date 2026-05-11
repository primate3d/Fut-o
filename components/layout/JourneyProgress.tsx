"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProgressSteps } from "@/components/ui/ProgressSteps";
import { siteConfig } from "@/config/site";
import {
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  isAnalysisForDocuments,
  storeMockAnalysis
} from "@/features/analysis";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";

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

  const applyProgress = useCallback((
    documents: ReturnType<typeof getStoredUploadedDocuments>,
    analysis: ReturnType<typeof getStoredMockAnalysis>
  ) => {
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
  }, [currentStep]);

  useEffect(() => {
    const documents = getStoredUploadedDocuments();
    const analysis = getStoredMockAnalysis();
    applyProgress(documents, analysis);

    async function loadServerState() {
      const serverDocuments = await getStoredUploadedDocumentsServer();
      const serverAnalysis = await getStoredAnalysisServer();

      if (serverAnalysis) {
        storeMockAnalysis(serverAnalysis);
      }

      applyProgress(serverDocuments, serverAnalysis ?? analysis);
    }

    void loadServerState();
  }, [applyProgress, pathname]);

  return (
    <ProgressSteps
      completedStep={completedStep}
      currentStep={currentStep}
      steps={siteConfig.journey}
    />
  );
}
