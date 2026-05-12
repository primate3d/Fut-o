import { mockAccessKeys } from "@/data/mock";
import type { AccessKey } from "@/types";

export const ACCESS_KEY_STORAGE_KEY = "futeo.activeAccessKey";
export const PURCHASED_ACCESS_KEYS_STORAGE_KEY = "futeo.purchasedAccessKeys";

export type AccessKeyPlan = AccessKey["plan"];

export type PlanAddon = {
  label: string;
  price: string;
  priceValue: number;
};

export type AccessKeyPlanDefinition = {
  plan: AccessKeyPlan;
  name: string;
  price: string;
  priceValue: number;
  description: string;
  items: string[];
  addons?: PlanAddon[];
  addonsTotalLabel?: string;
  premiumHint?: string;
  highlighted?: boolean;
};

export const accessKeyPlans: AccessKeyPlanDefinition[] = [
  {
    plan: "simple",
    name: "Analyse simple",
    price: "9,90 €",
    priceValue: 9.9,
    description:
      "Un premier point clair à partir des éléments que vous choisissez d'ajouter.",
    items: [
      "Ajout de vos documents utiles",
      "Lecture claire par poste",
      "Premières pistes à vérifier",
      "Synthèse simple de votre situation",
      "Valable 14 jours après activation"
    ],
    addons: [
      { label: "Pistes de comparaison", price: "+10,00 €", priceValue: 10 },
      { label: "1 courrier au choix", price: "+7,00 €", priceValue: 7 },
      { label: "Pack courriers complet", price: "+25,00 €", priceValue: 25 }
    ],
    addonsTotalLabel: "Si tout est ajouté : 44,90 € au total",
    premiumHint: "Le plan Premium regroupe ces options pour 34,90 €"
  },
  {
    plan: "foyer",
    name: "Audit foyer",
    price: "19,90 €",
    priceValue: 19.9,
    description:
      "Un audit plus complet pour comprendre les postes à comparer ou renégocier.",
    items: [
      "Ajout de vos documents utiles",
      "Lecture claire par poste",
      "Premières pistes à vérifier",
      "Espace de suivi complet",
      "Pistes de comparaison par poste",
      "Recommandations prioritaires",
      "Valable 14 jours après activation"
    ],
    addons: [
      { label: "1 courrier au choix", price: "+7,00 €", priceValue: 7 },
      { label: "Pack courriers complet", price: "+15,00 €", priceValue: 15 }
    ],
    addonsTotalLabel: "Si tout est ajouté : 34,90 € au total",
    premiumHint:
      "Le plan Premium est au même prix et inclut en plus le compte rendu complet"
  },
  {
    plan: "premium",
    name: "Audit premium",
    price: "34,90 €",
    priceValue: 34.9,
    description:
      "Le parcours complet avec comparaison, compte rendu et courriers prêts à adapter.",
    items: [
      "Ajout de vos documents utiles",
      "Lecture claire par poste",
      "Premières pistes à vérifier",
      "Espace de suivi complet",
      "Pistes de comparaison par poste",
      "Recommandations prioritaires",
      "Compte rendu complet imprimable",
      "Courriers de négociation",
      "Courriers de résiliation",
      "Courriers de relance",
      "Valable 14 jours après activation"
    ],
    highlighted: true
  }
];

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

export function validateAccessKey(code: string, keys = mockAccessKeys) {
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

export function generateMockAccessKey(plan: AccessKeyPlan): AccessKey {
  return {
    id: `key_${plan}_${Date.now()}`,
    code: `FUTEO-${plan.toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    plan,
    usesRemaining: 1,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: true,
    createdAt: new Date().toISOString()
  };
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
