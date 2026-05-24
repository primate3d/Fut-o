"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  type AccessKeyStatus,
  getAccessKeyStatusServer,
  getPlanLabel,
  getStoredAccessKey,
  normalizeAccessKeyPlan
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accessStatus, setAccessStatus] = useState<AccessKeyStatus | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [allowedNames, setAllowedNames] = useState<string[]>([""]);
  const [profilePostalAddress, setProfilePostalAddress] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

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
            quotaExceeded: storedKey.usesRemaining <= 0,
            profileRequired: false,
            profileCompleted: true
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

  const requiresSetup = Boolean(accessStatus?.profileRequired && !accessStatus.profileCompleted);
  const accountConfigured = Boolean(
    accessStatus?.profileRequired &&
      accessStatus.profileCompleted &&
      accessKey?.allowedNames?.length &&
      accessKey.profilePostalAddress
  );
  const maxAllowedNames =
    accessKey && normalizeAccessKeyPlan(accessKey.plan) === "famille" ? 3 : 1;

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessKey) return;

    setIsSavingProfile(true);
    setProfileMessage(null);
    const response = await fetch("/api/keys/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: accessKey.code,
        allowedNames,
        profilePostalAddress
      })
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setProfileMessage(payload.error ?? "Impossible d'enregistrer ce profil.");
      setIsSavingProfile(false);
      return;
    }

    const updatedStatus = await getAccessKeyStatusServer(accessKey.code);
    setAccessStatus(updatedStatus);
    setProfileMessage("Profil du foyer enregistre et verrouille.");
    setIsSavingProfile(false);

    const redirectPath = searchParams.get("redirect");
    if (redirectPath) {
      router.replace(redirectPath);
    }
  }

  function updateAllowedName(index: number, value: string) {
    setAllowedNames((current) =>
      current.map((name, currentIndex) => (currentIndex === index ? value : name))
    );
  }

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
        <h2 className="text-xl font-semibold text-navy-900">Accès</h2>
        <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <p>Email : {isLoadingProfile ? "Chargement..." : customerEmail}</p>
          <p>Accès : {accessKey ? getPlanLabel(accessKey.plan) : "—"}</p>
          <p>Clé active : {maskAccessCode(accessKey?.code)}</p>
          <p>Expiration : {formatDate(accessKey?.expiresAt)}</p>
          <p>Quota : {quotaLabel}</p>
        </div>
      </Card>
      {requiresSetup ? (
        <Card className="mx-auto max-w-3xl border-amber-200 bg-amber-50/50">
          <p className="text-sm font-semibold uppercase text-amber-800">
            Configuration initiale du foyer
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-navy-900">
            Sécurisez votre accès Futéo
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ce profil sécurise votre clé d&apos;accès, empêche l&apos;utilisation par
            un tiers et pré-remplit automatiquement vos futurs courriers de démarche.
            Une fois validé, il ne pourra plus être modifié.
          </p>
          <form className="mt-5 space-y-4" onSubmit={handleProfileSubmit}>
            <div className="space-y-3">
              {allowedNames.map((name, index) => (
                <label className="block text-sm font-semibold text-navy-900" key={index}>
                  {index === 0 ? "Nom de famille principal" : `Nom autorisé ${index + 1}`}
                  <input
                    className="mt-1 h-12 w-full rounded-lg border border-navy-100 bg-white px-4 text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    onChange={(event) => updateAllowedName(index, event.target.value)}
                    required
                    type="text"
                    value={name}
                  />
                </label>
              ))}
              {allowedNames.length < maxAllowedNames ? (
                <button
                  className="text-sm font-semibold text-sage-700 hover:underline"
                  onClick={() => setAllowedNames((current) => [...current, ""])}
                  type="button"
                >
                  + Ajouter un nom du foyer
                </button>
              ) : null}
            </div>
            <label className="block text-sm font-semibold text-navy-900">
              Adresse postale principale
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-navy-100 bg-white px-4 py-3 text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                onChange={(event) => setProfilePostalAddress(event.target.value)}
                required
                value={profilePostalAddress}
              />
            </label>
            {profileMessage ? (
              <p className="text-sm font-medium text-red-700">{profileMessage}</p>
            ) : null}
            <Button disabled={isSavingProfile} type="submit">
              {isSavingProfile ? "Enregistrement..." : "Enregistrer et verrouiller mon foyer"}
            </Button>
          </form>
        </Card>
      ) : accountConfigured ? (
        <Card className="border-sage-200 bg-sage-50/30">
          <div className="rounded-lg border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-semibold text-sage-800">
            🛡️ Votre foyer est sécurisé et configuré.
          </div>
          <h2 className="mt-5 text-xl font-semibold text-navy-900">Profil du foyer</h2>
          <div className="mt-4 grid gap-4 rounded-xl border border-navy-100 bg-white p-5 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Titulaire(s) autorisé(s)
              </p>
              <p className="mt-2 font-medium text-navy-900">
                Famille {accessKey?.allowedNames?.join(" / ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Adresse de référence
              </p>
              <p className="mt-2 font-medium text-navy-900">
                {accessKey?.profilePostalAddress}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Par mesure de sécurité, seuls les documents correspondants à ces
            informations d&apos;identité et d&apos;adresse seront analysés par
            l&apos;application.
          </p>
        </Card>
      ) : null}
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
