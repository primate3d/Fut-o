import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "complete" | "icon";
  className?: string;
};

export function Logo({ variant = "complete", className }: LogoProps) {
  const isIcon = variant === "icon";

  return (
    <Image
      alt="Futéo logo"
      className={cn("h-auto w-auto", className)}
      height={isIcon ? 653 : 617}
      priority={false}
      src={isIcon ? "/brand/futeo-icon.png" : "/brand/futeo-logo.png"}
      width={isIcon ? 653 : 1613}
    />
  );
}
