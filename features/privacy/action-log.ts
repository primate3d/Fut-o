import { getStoredAccessKey } from "@/features/billing/access-keys";

export type AuditActionLog = {
  id: string;
  createdAt: string;
  type: "letter_downloaded" | "report_downloaded";
  label: string;
  documentName?: string;
  provider?: string;
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
