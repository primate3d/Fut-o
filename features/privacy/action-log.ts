import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { GeneratedLetter, LetterPersonalization } from "@/types";

export type LetterActionSnapshot = {
  letter: GeneratedLetter;
  personalization: LetterPersonalization;
  documentName?: string;
  renderedContent?: string;
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

export type LetterTrackingStatus = "prepared" | "sent" | "followup_prepared";

export type StoredLetterRecord = {
  id: string;
  auditId: string;
  expenseId: string;
  letterType: GeneratedLetter["type"];
  status: LetterTrackingStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  parentRecordId?: string;
  snapshot: LetterActionSnapshot;
};

export const LETTER_TRACKING_STORAGE_PREFIX = "futeo.letterTracking";

function getActionLogStorageKey() {
  const activeKey = getStoredAccessKey();
  return activeKey ? `futeo.auditActions.${activeKey.code}` : "futeo.auditActions.anonymous";
}

function getLetterTrackingStorageKey() {
  const activeKey = getStoredAccessKey();
  return activeKey
    ? `${LETTER_TRACKING_STORAGE_PREFIX}.${activeKey.code}`
    : `${LETTER_TRACKING_STORAGE_PREFIX}.anonymous`;
}

export function getAuditActionLogs(): AuditActionLog[] {
  if (typeof window === "undefined") return [];

  const storageKey = getActionLogStorageKey();
  const storedValue =
    window.localStorage.getItem(storageKey) ??
    window.sessionStorage.getItem(storageKey);
  if (!storedValue) return [];

  try {
    const parsedValue = JSON.parse(storedValue) as AuditActionLog[];
    if (!window.localStorage.getItem(storageKey)) {
      window.localStorage.setItem(storageKey, storedValue);
    }
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
  window.localStorage.setItem(getActionLogStorageKey(), JSON.stringify(nextActions));

  return nextActions;
}

export function getStoredLetterRecords(auditId?: string): StoredLetterRecord[] {
  if (typeof window === "undefined") return [];

  const storedValue = window.localStorage.getItem(getLetterTrackingStorageKey());
  if (!storedValue) return [];

  try {
    const records = JSON.parse(storedValue) as StoredLetterRecord[];
    if (!Array.isArray(records)) return [];
    return auditId ? records.filter((record) => record.auditId === auditId) : records;
  } catch {
    return [];
  }
}

function storeLetterRecords(records: StoredLetterRecord[]) {
  window.localStorage.setItem(getLetterTrackingStorageKey(), JSON.stringify(records));
  return records;
}

export function getStoredLetterRecord(recordId: string) {
  return getStoredLetterRecords().find((record) => record.id === recordId) ?? null;
}

export function savePreparedLetter(
  auditId: string,
  snapshot: LetterActionSnapshot,
  preparedAt?: string
) {
  if (typeof window === "undefined" || !snapshot.letter.sourceExpenseId) return null;

  const now = new Date().toISOString();
  const preparedAtValue =
    preparedAt && !Number.isNaN(new Date(preparedAt).getTime()) ? preparedAt : now;
  const records = getStoredLetterRecords();
  const recordId = `${auditId}:${snapshot.letter.id}`;
  const existing = records.find((record) => record.id === recordId);
  const record: StoredLetterRecord = {
    id: recordId,
    auditId,
    expenseId: snapshot.letter.sourceExpenseId,
    letterType: snapshot.letter.type,
    status: existing?.status === "sent" ? "sent" : "prepared",
    createdAt: existing?.createdAt ?? preparedAtValue,
    updatedAt: now,
    sentAt: existing?.sentAt,
    snapshot: existing?.status === "sent" ? existing.snapshot : snapshot
  };
  storeLetterRecords([
    ...records.filter((candidate) => candidate.id !== recordId),
    record
  ]);
  return record;
}

export function confirmLetterSent(
  recordId: string,
  sentAt: string
): StoredLetterRecord | null {
  if (typeof window === "undefined") return null;

  const sentDate = new Date(sentAt);
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
  const sentDateKey = sentAt.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}/.test(sentAt) ||
    Number.isNaN(sentDate.getTime()) ||
    sentDateKey > todayKey
  ) {
    return null;
  }

  const storedRecords = getStoredLetterRecords();
  const sourceRecord = storedRecords.find((record) => record.id === recordId);
  if (
    !sourceRecord ||
    sourceRecord.parentRecordId ||
    sentDateKey < sourceRecord.createdAt.slice(0, 10)
  ) return null;

  let updatedRecord: StoredLetterRecord | null = null;
  const records = storedRecords.map((record) => {
    if (record.id !== recordId || record.parentRecordId) return record;
    updatedRecord = {
      ...record,
      status: "sent",
      sentAt,
      updatedAt: new Date().toISOString()
    };
    return updatedRecord;
  });
  if (!updatedRecord) return null;
  storeLetterRecords(records);
  return updatedRecord;
}

export function saveFollowupLetter(
  sourceRecordId: string,
  snapshot: LetterActionSnapshot
) {
  if (typeof window === "undefined") return null;

  const records = getStoredLetterRecords();
  const sourceRecord = records.find((record) => record.id === sourceRecordId);
  if (
    !sourceRecord ||
    sourceRecord.parentRecordId ||
    sourceRecord.status !== "sent" ||
    !sourceRecord.sentAt
  ) return null;

  const now = new Date().toISOString();
  const recordId = `${sourceRecord.id}:followup`;
  const existing = records.find((record) => record.id === recordId);
  const record: StoredLetterRecord = {
    id: recordId,
    auditId: sourceRecord.auditId,
    expenseId: sourceRecord.expenseId,
    letterType: "provider_followup",
    status: "followup_prepared",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    parentRecordId: sourceRecord.id,
    snapshot
  };
  storeLetterRecords([
    ...records.filter((candidate) => candidate.id !== recordId),
    record
  ]);
  return record;
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
