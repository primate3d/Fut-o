import type { AlternativeOffer } from "./service";

export const SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY = "futeo.selectedAlternativeOffer";

export type SelectedAlternativeOffer = Pick<
  AlternativeOffer,
  | "id"
  | "category"
  | "provider"
  | "name"
  | "url"
  | "monthlyPrice"
  | "estimatedYearlySaving"
> & {
  sourceExpenseId?: string;
};

function getSourceExpenseId(offer: AlternativeOffer) {
  const match = offer.id.match(/^alternative_(.+)_\d+$/);
  return match?.[1];
}

export function toSelectedAlternativeOffer(offer: AlternativeOffer): SelectedAlternativeOffer {
  return {
    id: offer.id,
    category: offer.category,
    provider: offer.provider,
    name: offer.name,
    url: offer.url,
    monthlyPrice: offer.monthlyPrice,
    estimatedYearlySaving: offer.estimatedYearlySaving,
    sourceExpenseId: getSourceExpenseId(offer)
  };
}

export function getSelectedAlternativeOffer(): SelectedAlternativeOffer | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY);
  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as SelectedAlternativeOffer;
  } catch {
    return null;
  }
}

export function storeSelectedAlternativeOffer(offer: AlternativeOffer) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY,
    JSON.stringify(toSelectedAlternativeOffer(offer))
  );
}
