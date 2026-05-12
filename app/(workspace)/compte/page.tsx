import { RotateCcw, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ResetAuditButton } from "@/features/privacy/ResetAuditButton";
import { DeleteDocumentsButton } from "@/features/privacy/DeleteDocumentsButton";

export default function AccountPage() {
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
        <h2 className="text-xl font-semibold text-navy-900">Accès personnel</h2>
        <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <p>Statut : espace ouvert</p>
          <p>Durée : 14 jours après activation</p>
          <p>Usage : personnel</p>
          <p>Abonnement : aucun prélèvement mensuel</p>
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
