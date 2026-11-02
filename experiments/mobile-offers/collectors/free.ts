import { fetchOfficialHtml } from "../fetch";
import { extractScriptById, htmlToText } from "../html";
import type {
  CollectorOptions,
  CollectorResult,
  MobileOffer,
} from "../types";
import { validateAndDedupe } from "../validate";

export const FREE_SOURCE_URL = "https://mobile.free.fr/";

interface FreePlan {
  name?: string;
  price?: number;
  endDate?: string | null;
  isActive?: boolean;
  discount?: Array<{ type?: string }>;
  options?: string[];
  "5g"?: boolean;
  nationalData?: { fairuse?: number };
  roamingData?: { fairuse?: number };
}

function megabytesToGigabytes(value: number | undefined): number | null {
  if (value === undefined || value < 0) return null;
  return value / 1000;
}

export function parseFreeOffers(
  html: string,
  retrievedAt: string,
): CollectorResult {
  const script = extractScriptById(html, "__NEXT_DATA__");
  if (!script) {
    return {
      provider: "Free Mobile",
      sourceUrl: FREE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "STRUCTURE_CHANGED",
          message: "Bloc __NEXT_DATA__ introuvable.",
          sourceUrl: FREE_SOURCE_URL,
        },
      ],
    };
  }

  let plans: FreePlan[];
  try {
    const payload = JSON.parse(script) as {
      props?: { pageProps?: { plans?: FreePlan[] } };
    };
    plans = payload.props?.pageProps?.plans ?? [];
  } catch {
    plans = [];
  }

  if (plans.length === 0) {
    return {
      provider: "Free Mobile",
      sourceUrl: FREE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "STRUCTURE_CHANGED",
          message: "Aucun forfait structuré exploitable.",
          sourceUrl: FREE_SOURCE_URL,
        },
      ],
    };
  }

  const pageText = htmlToText(html);
  const now = new Date(retrievedAt).getTime();
  const activePlans = plans.filter((plan) => {
    if (plan.isActive === false) return false;
    if (!plan.endDate) return true;
    return new Date(plan.endDate).getTime() >= now;
  });
  const standardPlan = activePlans.find((plan) =>
    plan.name?.includes("Free 5G+"),
  );

  const offers = activePlans.map((plan): MobileOffer => {
    const nationalFairuse = plan.nationalData?.fairuse;
    const roamingFairuse = plan.roamingData?.fairuse;
    const unlimitedData = nationalFairuse === -1;
    const conditions: string[] = [];
    const hasFreeboxDiscount = plan.discount?.some((discount) =>
      discount.type?.startsWith("freebox"),
    );
    if (hasFreeboxDiscount) {
      conditions.push(
        "Des remises distinctes sont réservées aux abonnés Freebox; le prix public affiché n'en tient pas compte.",
      );
    }

    const isSeries = plan.name === "Série Free";
    const hasSeriesTransition =
      isSeries &&
      /pendant\s+1\s+an\s+puis\s+Forfait\s+Free\s+5G\+/i.test(pageText);
    if (hasSeriesTransition) {
      conditions.push("Pendant 12 mois, puis bascule vers le Forfait Free 5G+.");
    }

    const monthlyPrice =
      typeof plan.price === "number" ? plan.price / 100 : null;
    const supports5g = plan["5g"] === true || plan.options?.includes("5g");

    return {
      provider: "Free Mobile",
      offerName: plan.name?.trim() ?? "",
      monthlyPrice,
      includedDataGB: unlimitedData
        ? null
        : megabytesToGigabytes(nationalFairuse),
      unlimitedData,
      euDataGB: megabytesToGigabytes(roamingFairuse),
      network: supports5g ? "Free Mobile 5G/4G" : "Free Mobile 4G",
      technology: supports5g ? "5G" : "4G",
      commitmentMonths: 0,
      promotionPrice: hasSeriesTransition ? monthlyPrice : null,
      promotionDuration: hasSeriesTransition ? 12 : null,
      priceAfterPromotion:
        hasSeriesTransition && typeof standardPlan?.price === "number"
          ? standardPlan.price / 100
          : null,
      activationFees: null,
      simFees: null,
      conditionalPrices: [],
      pricingTiers: [],
      conditions,
      evidence: [
        `${plan.name ?? "Forfait sans nom"}: ${monthlyPrice ?? "prix inconnu"} €/mois, fair-use ${nationalFairuse ?? "inconnu"} Mo`,
      ],
      sourceUrl: FREE_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    };
  });

  const validated = validateAndDedupe(offers, FREE_SOURCE_URL);
  return {
    provider: "Free Mobile",
    sourceUrl: FREE_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectFreeOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    const html = await fetchOfficialHtml(FREE_SOURCE_URL, options);
    return parseFreeOffers(html, retrievedAt);
  } catch (error) {
    return {
      provider: "Free Mobile",
      sourceUrl: FREE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "FETCH_FAILED",
          message: error instanceof Error ? error.message : "Erreur inconnue",
          sourceUrl: FREE_SOURCE_URL,
        },
      ],
    };
  }
}
