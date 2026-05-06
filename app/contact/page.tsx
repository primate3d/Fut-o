import { Mail, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function ContactPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Contact
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Une question avant de commencer ?
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Futéo reste volontairement simple. Pour une question sur le service,
            l'accès par clé ou les documents à ajouter, vous pouvez utiliser le
            formulaire ou écrire directement par email.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Card className="bg-white/90">
          <Mail className="text-sage-700" size={26} />
          <h2 className="mt-4 text-xl font-bold text-[#12243d]">
            Email visible
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            Remplacez cette adresse par l'adresse officielle avant la mise en
            ligne publique.
          </p>
          <a
            className="mt-4 inline-flex font-semibold text-sage-700 underline underline-offset-4"
            href="mailto:contact@futeo.fr"
          >
            contact@futeo.fr
          </a>
        </Card>

        <Card className="bg-white/90">
          <div className="flex items-center gap-3">
            <MessageSquareText className="text-sage-700" size={24} />
            <h2 className="text-xl font-bold text-[#12243d]">
              Formulaire simple
            </h2>
          </div>
          <form
            action="mailto:contact@futeo.fr"
            className="mt-6 grid gap-4"
            encType="text/plain"
            method="post"
          >
            <label className="grid gap-2 text-sm font-semibold text-[#12243d]">
              Votre nom
              <input
                className="h-11 rounded-lg border border-navy-100 bg-white px-3 text-sm font-normal outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                name="nom"
                type="text"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#12243d]">
              Votre email
              <input
                className="h-11 rounded-lg border border-navy-100 bg-white px-3 text-sm font-normal outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                name="email"
                type="email"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#12243d]">
              Message
              <textarea
                className="min-h-32 rounded-lg border border-navy-100 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                name="message"
              />
            </label>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
              type="submit"
            >
              Envoyer le message
            </button>
          </form>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Ce formulaire ouvre le logiciel email de l'utilisateur. Aucun envoi
            serveur n'est branché à ce stade.
          </p>
        </Card>
      </section>
    </main>
  );
}
