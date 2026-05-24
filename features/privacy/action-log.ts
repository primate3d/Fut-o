import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { GeneratedLetter, LetterPersonalization } from "@/types";

export type LetterActionSnapshot = {
  letter: GeneratedLetter;
  personalization: LetterPersonalization;
  documentName?: string;
};

export type AuditActionLog = {
  id: string;
  createdAt: string;
  type: "letter_downloaded" | "letter_email_prepared" | "report_downloaded";
  label: string;
  documentName?: string;
  provider?: string;
  letterSnapshot?: LetterActionSnapshot;
};

function getActionLogStorageKey() {
  const activeKey = getStoredAccessKey();
  return activeKey ? `futeo.auditActions.${activeKey.code}` : "futeo.auditActions.anonymous";
}

export function getAuditActionLogs(): AuditActionLog[] {
  if (typeof window === "undefined") return [];

  const storedValue = window.sessionStorage.getItem(getActionLogStorageKey());
  if (!storedValue) return [];

  try {
    const parsedValue = JSON.parse(storedValue) as AuditActionLog[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export function addAuditActionLog(
  action: Omit<AuditActionLog, "id" | "createdAt">
) {
  if (typeof window === "undefined") return [];

  const nextAction: AuditActionLog = {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...action
  };
  const nextActions = [...getAuditActionLogs(), nextAction];
  window.sessionStorage.setItem(getActionLogStorageKey(), JSON.stringify(nextActions));

  return nextActions;
}

export function queueLetterFollowup(action: AuditActionLog) {
  if (typeof window === "undefined" || !action.letterSnapshot) return false;

  window.sessionStorage.setItem(
    `${getActionLogStorageKey()}.pendingFollowup`,
    JSON.stringify(action)
  );
  return true;
}

export function takeQueuedLetterFollowup(): AuditActionLog | null {
  if (typeof window === "undefined") return null;

  const storageKey = `${getActionLogStorageKey()}.pendingFollowup`;
  const storedValue = window.sessionStorage.getItem(storageKey);
  window.sessionStorage.removeItem(storageKey);
  if (!storedValue) return null;

  try {
    const parsedValue = JSON.parse(storedValue) as AuditActionLog;
    return parsedValue.letterSnapshot ? parsedValue : null;
  } catch {
    return null;
  }
}
