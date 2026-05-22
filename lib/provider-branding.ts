export type ProviderBranding = {
  name: string;
  domain?: string;
  logoUrl?: string;
};

const providerDomains: Record<string, string> = {
  "Free": "free.fr",
  "Free Mobile": "free.fr",
  "B&You": "bouyguestelecom.fr",
  "Bouygues": "bouyguestelecom.fr",
  "Bouygues Telecom": "bouyguestelecom.fr",
  "Sosh": "sosh.fr",
  "Orange": "orange.fr",
  "SFR": "sfr.fr",
  "EDF": "edf.fr",
  "Engie": "engie.fr",
  "Mint Energie": "mint-energie.com",
  "TotalEnergies": "totalenergies.fr",
  "Alpiq": "alpiq.fr",
  "Octopus Energy": "octopusenergy.fr",
  "Netflix": "netflix.com",
  "Canal": "canalplus.com",
  "AXA": "axa.fr",
  "Allianz": "allianz.fr",
  "MAIF": "maif.fr",
  "MACIF": "macif.fr",
  "Direct Assurance": "directassurance.fr",
  "Leocare": "leocare.eu",
  "L'olivier Assurance": "lolivier.fr",
  "Luko": "luko.eu",
  "Prixtel": "prixtel.com",
  "Lebara": "lebara.com",
  "Syma Mobile": "symamobile.com",
  "La Poste Mobile": "lapostemobile.fr",
  "RED by SFR": "red-by-sfr.fr",
  "Boursorama": "boursobank.com",
  "Credit Agricole": "credit-agricole.fr",
  "Crédit Agricole": "credit-agricole.fr",
  "Banque Populaire": "banquepopulaire.fr"
};

export function getProviderBranding(provider?: string): ProviderBranding {
  const name = provider || "Inconnu";
  const domain = provider ? providerDomains[provider] : undefined;

  return {
    name,
    domain,
    logoUrl: domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined
  };
}
