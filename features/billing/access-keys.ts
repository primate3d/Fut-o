import { mockAccessKeys } from "@/data/mock";
import type { AccessKey, UploadedDocument } from "@/types";

export const ACCESS_KEY_STORAGE_KEY = "futeo.activeAccessKey";
export const PURCHASED_ACCESS_KEYS_STORAGE_KEY = "futeo.purchasedAccessKeys";
export const FREE_TRIAL_USAGE_STORAGE_KEY = "futeo.freeTrialUsedAt";

export type AccessKeyPlan = AccessKey["plan"];
export type PublicAccessKeyPlan = "decouverte" | "foyer" | "famille";
export type AuditFoyerCategory = "energie" | "mobile" | "internet" | "assurance_habitation" | "assurance_auto";

export const AUDIT_FOYER_CATEGORY_LIMIT_MESSAGE =
  "Cette catégorie est déjà couverte par votre Audit Foyer. Pour analyser plusieurs contrats d'une même catégorie, choisissez l'Audit Famille.";

export type PlanAddon = {
  label: string;
  price: string;
  priceValue: number;
};

export type AccessKeyPlanDefinition = {
  plan: PublicAccessKeyPlan;
  name: string;
  price: string;
  priceValue: number;
  description: string;
  items: string[];
  addons?: PlanAddon[];
  addonsTotalLabel?: string;
  premiumHint?: string;
  ctaHelper?: string;
  highlighted?: boolean;
};

export const accessKeyPlans: AccessKeyPlanDefinition[] = [
  {
    plan: "decouverte",
    name: "Découverte gratuite",
    price: "0 €",
    priceValue: 0,
    description: "Pour découvrir Futéo en quelques minutes.",
    items: [
      "Analyse de 1 à 2 documents",
      "Comparatif simple des économies possibles",
      "Aperçu des résultats",
      "Aperçu des démarches et courriers",
      "Sans courrier complet",
      "Sans rapport complet"
    ],
    ctaHelper: "Idéal pour découvrir Futéo avant un audit complet."
  },
  {
    plan: "foyer",
    name: "Audit Foyer",
    price: "9,90 €",
    priceValue: 9.9,
    description:
      "Pour un foyer classique et les principales dépenses du quotidien.",
    items: [
      "Analyse complète des documents essentiels du foyer",
      "Énergie, internet, mobile, assurance habitation, assurance auto",
      "Courriers complets prêts à l'emploi",
      "Rapport complet",
      "Accès actif pendant 7 jours",
      "Paiement unique, sans abonnement"
    ],
    ctaHelper: "L'offre la plus simple pour faire le point sur vos contrats essentiels.",
    highlighted: true
  },
  {
    plan: "famille",
    name: "Audit Famille",
    price: "19,90 €",
    priceValue: 19.9,
    description:
      "Pour les foyers avec plusieurs membres, plusieurs contrats et davantage de dépenses à analyser.",
    items: [
      "Accès complet Futéo",
      "Analyse de plusieurs documents par catégorie",
      "Adapté aux foyers avec plusieurs lignes mobiles, assurances ou contrats",
      "Courriers complets prêts à l'emploi",
      "Rapport complet",
      "Suivi plus large des dépenses du foyer",
      "Accès actif pendant 14 jours",
      "Paiement unique, sans abonnement"
    ],
    ctaHelper: "Idéal pour une analyse plus complète des dépenses du foyer et de la famille."
  }
];

export function normalizeAccessKeyPlan(plan: AccessKeyPlan): PublicAccessKeyPlan {
  if (plan === "premium") return "famille";
  if (plan === "simple") return "foyer";
  if (plan === "decouverte" || plan === "foyer" || plan === "famille") return plan;
  return "foyer";
}

export function getPlanLabel(plan: AccessKeyPlan) {
  const normalizedPlan = normalizeAccessKeyPlan(plan);
  return accessKeyPlans.find((item) => item.plan === normalizedPlan)?.name ?? "Audit Foyer";
}

export function getAccessDurationDays(plan: AccessKeyPlan) {
  const normalizedPlan = normalizeAccessKeyPlan(plan);
  if (normalizedPlan === "famille") return 14;
  return 7;
}

export function isDiscoveryPlan(plan?: AccessKeyPlan | null) {
  return plan === "decouverte";
}

export function isAuditFoyerPlan(plan?: AccessKeyPlan | null) {
  return plan ? normalizeAccessKeyPlan(plan) === "foyer" : false;
}

export function getAuditFoyerCategory(
  documentType?: UploadedDocument["documentType"]
): AuditFoyerCategory | null {
  if (documentType === "electricity_invoice" || documentType === "gas_invoice") {
    return "energie";
  }
  if (documentType === "mobile_invoice") {
    return "mobile";
  }
  if (documentType === "internet_invoice") {
    return "internet";
  }
  if (documentType === "home_insurance") {
    return "assurance_habitation";
  }
  if (documentType === "car_insurance") {
    return "assurance_auto";
  }
  return null;
}

export function validateAuditFoyerDocuments(
  plan: AccessKeyPlan | undefined | null,
  documents: UploadedDocument[]
) {
  if (!isAuditFoyerPlan(plan)) {
    return { isValid: true, message: null as string | null };
  }

  const coveredCategories = new Set<AuditFoyerCategory>();
  for (const document of documents) {
    if (document.status === "error") continue;
    const category = getAuditFoyerCategory(document.documentType);
    if (!category) continue;
    if (coveredCategories.has(category)) {
      return {
        isValid: false,
        message: AUDIT_FOYER_CATEGORY_LIMIT_MESSAGE
      };
    }
    coveredCategories.add(category);
  }

  return { isValid: true, message: null as string | null };
}

export function canUseDocumentWithPlan(
  plan: AccessKeyPlan | undefined | null,
  currentDocuments: UploadedDocument[],
  nextDocument: UploadedDocument
) {
  return validateAuditFoyerDocuments(plan, [
    ...currentDocuments.filter((document) => document.id !== nextDocument.id),
    nextDocument
  ]);
}

export function hasUsedFreeTrial() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(FREE_TRIAL_USAGE_STORAGE_KEY));
}

export function markFreeTrialUsed(date = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FREE_TRIAL_USAGE_STORAGE_KEY, date);
}

export async function validateAccessKeyServer(code: string): Promise<AccessKey | null> {
  try {
    const response = await fetch(`/api/keys/status?code=${code}`);
    if (!response.ok) return null;
    const { key } = (await response.json()) as { key: AccessKey | null };
    return key;
  } catch {
    return null;
  }
}

function getDefaultValidationKeys() {
  return process.env.NODE_ENV === "production" ? [] : mockAccessKeys;
}

export function validateAccessKey(code: string, keys = getDefaultValidationKeys()) {
  const normalizedCode = code.trim().toUpperCase();
  const key = keys.find((item) => item.code.toUpperCase() === normalizedCode);

  if (!key || !key.isActive || key.usesRemaining <= 0) {
    return null;
  }

  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
    return null;
  }

  return key;
}

export function generateAccessKey(plan: AccessKeyPlan): AccessKey {
  const expiresAt = new Date(
    Date.now() + getAccessDurationDays(plan) * 24 * 60 * 60 * 1000
  ).toISOString();

  return {
    id: `key_${plan}_${Date.now()}`,
    code: `FUTEO-${plan.toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    plan,
    usesRemaining: 1,
    expiresAt,
    isActive: true,
    createdAt: new Date().toISOString(),
    hasUsedFreeTrial: false
  };
}

export function generateMockAccessKey(plan: AccessKeyPlan): AccessKey {
  if (process.env.NODE_ENV === "production") {
    throw new Error("generateMockAccessKey est réservé au développement local");
  }

  return generateAccessKey(plan);
}

export function getStoredAccessKey(): AccessKey | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedKey = JSON.parse(storedValue) as AccessKey;
    return validateAccessKey(parsedKey.code, [parsedKey]) ? parsedKey : null;
  } catch {
    return null;
  }
}

export async function storeAccessKey(accessKey: AccessKey) {
  const previousKey = getStoredAccessKey();
  if (previousKey?.code !== accessKey.code && typeof window !== "undefined") {
    window.localStorage.removeItem("futeo.uploadedDocuments");
    window.localStorage.removeItem("futeo.mockAnalysis");
    window.localStorage.removeItem("futeo.uploadedDocumentsOwner");
    if (process.env.NODE_ENV !== "production") {
      console.debug("[Futéo flow] Clé changée: audit local réinitialisé", {
        previousKey: previousKey?.code,
        nextKey: accessKey.code
      });
    }
  }

  window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, JSON.stringify(accessKey));

  try {
    const response = await fetch("/api/keys/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: accessKey.code })
    });

    if (response.ok) {
      const { key } = (await response.json()) as { key: AccessKey };
      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, JSON.stringify(key));
    }
  } catch {
    // Le stockage local reste disponible tant que l'activation serveur n'est pas branchée.
  }
}

export function getPurchasedAccessKeys(): AccessKey[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(PURCHASED_ACCESS_KEYS_STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    return JSON.parse(storedValue) as AccessKey[];
  } catch {
    return [];
  }
}

export function storePurchasedAccessKey(accessKey: AccessKey) {
  const existingKeys = getPurchasedAccessKeys();
  window.localStorage.setItem(
    PURCHASED_ACCESS_KEYS_STORAGE_KEY,
    JSON.stringify([accessKey, ...existingKeys])
  );
}
