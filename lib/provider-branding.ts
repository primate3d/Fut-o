export type ProviderBranding = {
  name: string;
  domain?: string;
  logoUrl?: string;
};

const providerDomains: Record<string, string> = {
  "Free": "free.fr",
  "Free Mobile": "free.fr",
  "NRJ Mobile": "nrjmobile.fr",
  "Prixtel": "prixtel.com",
  "RED by SFR": "red-by-sfr.fr",
  "B&You": "bouyguestelecom.fr",
  "Bouygues": "bouyguestelecom.fr",
  "Bouygues Telecom": "bouyguestelecom.fr",
  "Sosh": "sosh.fr",
  "Orange": "orange.fr",
  "SFR": "sfr.fr",
  "EDF": "edf.fr",
  "Engie": "engie.fr",
  "Netflix": "netflix.com",
  "Canal": "canalplus.com",
  "AXA": "axa.fr",
  "Allianz": "allianz.fr",
  "MAIF": "maif.fr",
  "MACIF": "macif.fr",
  "Boursorama": "boursobank.com",
  "Credit Agricole": "credit-agricole.fr",
  "Crédit Agricole": "credit-agricole.fr",
  "Banque Populaire": "banquepopulaire.fr"
};

export function getProviderBranding(provider: string): ProviderBranding {
  const domain = providerDomains[provider];

  return {
    name: provider,
    domain,
    logoUrl: domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined
  };
}
