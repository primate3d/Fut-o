import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatBytes(value: number) {
  if (value === 0) {
    return "0 o";
  }

  const units = ["o", "Ko", "Mo", "Go"];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );
  const formattedValue = value / 1024 ** unitIndex;

  return `${formattedValue.toLocaleString("fr-FR", {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1
  })} ${units[unitIndex]}`;
}
