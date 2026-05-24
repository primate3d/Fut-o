export interface MobileProfile {
  id: string;
  minData: number;
  maxData: number;
  label: string;
  alternativePrice: number;
  alternativeData: string;
  network: string;
}

export interface BoxProfile {
  id: string;
  hasTv: boolean;
  label: string;
  alternativePrice: number;
  alternativeLabel: string;
}

export const MOBILE_PROFILES: MobileProfile[] = [
  {
    id: "petit",
    minData: 0,
    maxData: 20,
    label: "Petit Consommateur",
    alternativePrice: 4.99,
    alternativeData: "20 Go",
    network: "4G"
  },
  {
    id: "standard",
    minData: 21,
    maxData: 90,
    label: "Consommateur Standard",
    alternativePrice: 8.99,
    alternativeData: "100 Go",
    network: "4G/5G"
  },
  {
    id: "gros",
    minData: 91,
    maxData: 150,
    label: "Gros Consommateur",
    alternativePrice: 9.99,
    alternativeData: "130 Go",
    network: "5G"
  },
  {
    id: "ultra",
    minData: 151,
    maxData: 9999,
    label: "Ultra / Intensif",
    alternativePrice: 19.99,
    alternativeData: "Illimité",
    network: "5G"
  }
];

export const BOX_PROFILES: BoxProfile[] = [
  {
    id: "dual-play",
    hasTv: false,
    label: "Profil Éco (Sans TV)",
    alternativePrice: 24.99,
    alternativeLabel: "Box Fibre + Fixe"
  },
  {
    id: "triple-play",
    hasTv: true,
    label: "Profil Standard (Avec TV)",
    alternativePrice: 24.99,
    alternativeLabel: "Box Fibre + Fixe + TV"
  }
];
