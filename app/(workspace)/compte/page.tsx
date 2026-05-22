"use client";

import { useEffect, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  type AccessKeyStatus,
  getAccessKeyStatusServer,
  getPlanLabel,
  getStoredAccessKey
} from "@/features/billing/access-keys";
import { ResetAuditButton } from "@/features/privacy/ResetAuditButton";
import { DeleteDocumentsButton } from "@/features/privacy/DeleteDocumentsButton";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(value));
}

function maskAccessCode(code?: string | null) {
  if (!code) return "—";
  if (code.length <= 6) return code;
  return `${code.slice(0, 4)}••••${code.slice(-4)}`;
}

export default function AccountPage() {
  const [accessStatus, setAccessStatus] = useState<AccessKeyStatus | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const storedKey = getStoredAccessKey();

      if (!storedKey) {
        if (isMounted) {
          setAccessStatus(null);
          setIsLoadingProfile(false);
        }
        return;
      }

      const serverStatus = await getAccessKeyStatusServer(storedKey.code);

      if (isMounted) {
        setAccessStatus(
          serverStatus ?? {
            key: storedKey,
            customerEmail: null,
            hasQuota: storedKey.usesRemaining > 0,
            usesRemaining: storedKey.usesRemaining,
            quotaExceeded: storedKey.usesRemaining <= 0
          }
        );
        setIsLoadingProfile(false);
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const accessKey = accessStatus?.key ?? null;
  const customerEmail = accessStatus?.customerEmail || "E-mail non disponible pour cette clé";
  const quotaLabel = accessStatus
    ? accessStatus.quotaExceeded
      ? "Quota épuisé"
      : `${accessStatus.usesRemaining} analyse(s) restante(s)`
    : "—";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy-900">Compte utilisateur</h1>
        <p className="mt-2 text-slate-600">
          Retrouvez votre espace et gardez la main sur les documents que vous
          choisissez d'ajouter.
        </p>
      </div>
      <Card>
        <h2 className="text-xl font-semibold text-navy-900">Profil</h2>
        <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <p>Prénom : —</p>
          <p>Nom : —</p>
          <p>Email : {isLoadingProfile ? "Chargement..." : customerEmail}</p>
          <p>Accès : {accessKey ? getPlanLabel(accessKey.plan) : "—"}</p>
          <p>Clé active : {maskAccessCode(accessKey?.code)}</p>
          <p>Expiration : {formatDate(accessKey?.expiresAt)}</p>
          <p>Quota : {quotaLabel}</p>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-sage-100 bg-sage-50/30">
          <ShieldCheck className="text-sage-700" size={26} />
          <h2 className="mt-4 text-lg font-semibold text-navy-900">Confidentialité active</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Une fois votre analyse générée, nous vous recommandons de supprimer
            les fichiers sources. Votre rapport et vos courriers resteront
            accessibles jusqu'à l'expiration de votre clé (14 jours).
          </p>
          <div className="mt-5">
            <DeleteDocumentsButton />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              💡 Cette action effacera définitivement les fichiers PDF/images de notre
              hébergeur. Seuls vos résultats textuels seront conservés pendant les 14 jours
              de validité de votre clé.
            </p>
          </div>
        </Card>
        <Card>
          <RotateCcw className="text-slate-400" size={26} />
          <h2 className="mt-4 text-lg font-semibold text-navy-900">Réinitialisation</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Vous souhaitez effacer l'intégralité de ce dossier (analyse comprise)
            pour recommencer à zéro avec de nouveaux documents ?
          </p>
          <div className="mt-5">
            <ResetAuditButton />
          </div>
        </Card>
      </div>
    </section>
  );
}
