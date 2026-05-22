"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

type ProviderLogoProps = {
  provider?: string;
  logoUrl?: string;
  className?: string;
};

function getInitials(provider?: string) {
  if (!provider) return "?";
  return provider
    .split(/[\s&+-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function ProviderLogo({ provider, logoUrl, className }: ProviderLogoProps) {
  const [hasError, setHasError] = useState(false);
  const shouldShowImage = Boolean(logoUrl) && !hasError;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-navy-100 bg-white text-xs font-bold text-navy-700 shadow-sm",
        className
      )}
    >
      {shouldShowImage && logoUrl ? (
        <Image
          alt=""
          className="h-full w-full object-contain p-1.5"
          height={40}
          onError={() => setHasError(true)}
          src={logoUrl}
          width={40}
        />
      ) : (
        getInitials(provider) || "?"
      )}
    </span>
  );
}
