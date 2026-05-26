import {
  ArrowRight,
  Ban,
  CreditCard,
  FileText,
  Handshake,
  KeyRound,
  ShieldCheck
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const startAuditHref = "/activer-cle?redirect=/importer";
const manualSimulationHref =
  "/activer-cle?redirect=%2Fresultats%3Fmode%3Dmanuel";
const lettersAccessHref = "/activer-cle?redirect=/courriers";

const narrativeSteps = [
  {
    alt: "Documents et factures poses sur une table de maison",
    image:
      "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=82",
    title: "Importez ou saisissez vos prix",
    text: "Déposez votre facture en 1 clic pour une lecture automatique, ou entrez vos montants à la main en quelques secondes.",
    note: "Vous choisissez le mode le plus adapté à votre document et à votre confidentialité."
  },
  {
    alt: "Calculatrice, ordinateur et papiers administratifs pour suivre un budget",
    image:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=82",
    title: "On identifie ce qui mérite comparaison",
    text: "À partir des éléments que vous avez partagés, on repère les postes qui méritent d'être comparés et on cherche des offres plus adaptées à votre situation.",
    note: "Ces postes sont comparés avec des offres réellement disponibles."
  },
  {
    alt: "Courrier et documents prepares pour une decision de foyer",
    image:
      "https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=900&q=82",
    title: "On prépare vos démarches",
    text: "Résiliation, négociation, relance : les courriers sont prêts à être relus, adaptés puis envoyés.",
    note: "Vous gardez toujours la décision finale."
  }
];

const letterItems = [
  "Courrier de resiliation",
  "Demande de negociation",
  "Relance fournisseur",
  "Demande de changement d'offre",
  "Comparaison a transmettre au conseiller ou au service client"
];

const audienceItems = [
  "Vous avez plusieurs abonnements ou contrats",
  "Vous voulez verifier certains postes sans tout transmettre",
  "Vous n'avez pas le temps de comparer",
  "Vous repoussez souvent les demarches",
  "Vous voulez des courriers prets a adapter"
];

const accessItems = [
  {
    icon: <KeyRound size={22} />,
    title: "Cle personnelle",
    text: "Une cle ouvre votre parcours complet depuis votre espace, pour un usage personnel."
  },
  {
    icon: <CreditCard size={22} />,
    title: "Paiement unique",
    text: "Le paiement se fait une seule fois pour ouvrir le service, sans prelevement mensuel."
  },
  {
    icon: <Ban size={22} />,
    title: "Sans abonnement",
    text: "Aucun engagement. Vous utilisez Futeo quand vous en avez besoin."
  }
];

export default function HomePage() {
  return (
    <main className="bg-[#fbf6ed] text-navy-900">
      <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#142238]">
        <Image
          alt="Couple a la maison consultant des documents du foyer autour d'une table"
          className="object-cover"
          fill
          priority
          sizes="100vw"
          src="https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1800&q=88"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,25,42,0.9)_0%,rgba(13,34,39,0.72)_48%,rgba(13,34,39,0.22)_100%)]" />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl text-white">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-sage-500/25 bg-sage-500/20 px-4 py-2 text-xs font-semibold text-[#d6f1df] backdrop-blur">
                Cle personnelle
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur">
                Paiement unique
              </span>
              <span className="rounded-full border border-[#9bd7b5] bg-sage-500/25 px-4 py-2 text-xs font-bold text-[#9bd7b5] backdrop-blur shadow-[0_0_15px_rgba(155,215,181,0.2)]">
                Sans abonnement
              </span>
            </div>
            <p className="mt-8 max-w-xl text-sm font-semibold uppercase tracking-wide text-[#c9e4d2]">
              LA PLUPART DES GENS NE CHANGENT PAS LEURS CONTRATS PARCE QUE COMPARER PREND DU TEMPS. ICI, ON LE FAIT POUR VOUS.
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-snug tracking-tight md:text-5xl">
              Vous payez plusieurs abonnements... mais vous ne savez plus vraiment si vous êtes encore au bon prix.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/92">
              À partir des documents que vous choisissez de partager, vous voyez clair sur vos dépenses, les offres adaptées sont identifiées, et les démarches sont prêtes quand vous décidez d'agir.
            </p>
            <div className="mb-4 mt-6 flex w-full justify-center">
              <span className="block max-w-max rounded bg-white px-6 py-2 text-center text-xs font-extrabold uppercase tracking-wide text-slate-900 shadow-sm sm:text-sm md:text-base">
                AVEC OU SANS FACTURE : LA SAISIE MANUELLE EST AUSSI DISPONIBLE !
              </span>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button href={startAuditHref}>
                Voir mes dépenses clairement <ArrowRight size={18} />
              </Button>
              <Button href={startAuditHref} variant="secondary" className="bg-transparent text-white border border-white/20 hover:bg-white/10">
                Commencer maintenant
              </Button>
            </div>
            <div className="mt-4">
              <Button
                className="border border-white/20 bg-white/5 text-white hover:bg-white/10"
                href={manualSimulationHref}
                variant="ghost"
              >
                💡 Pas de facture sous la main ? Faites une simulation manuelle en 30 secondes
              </Button>
            </div>
            <p className="mt-6 text-sm font-medium italic text-white/78">
              Accès par clé personnelle. Vous gardez toujours la main.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-[4.5rem] sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              COMMENT ÇA SE PASSE
            </p>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-[#12243d]">
              De vos documents à une démarche prête.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              L'objectif est simple : comprendre ce que vous payez, repérer les contrats qui méritent d'être comparés, puis repartir avec une action claire, avec des démarches prêtes à utiliser quand vous décidez d'agir.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-[#e5d8c6] bg-white/90 p-5 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                    Exemple généré automatiquement
                  </p>
                  <h3 className="mt-2 text-lg font-semibold leading-6 text-[#12243d]">
                    Démarche prête à envoyer
                  </h3>
                </div>
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-sage-50">
                  <Image
                    alt=""
                    className="object-contain p-1.5"
                    fill
                    sizes="44px"
                    src="/brand/futeo-icon.png"
                  />
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-[#e9dece]">
                <div className="grid grid-cols-2 bg-[#fbf6ed] text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div className="border-r border-[#e9dece] px-4 py-3">
                    Contrat actuel
                  </div>
                  <div className="px-4 py-3">Offre comparée</div>
                </div>
                <div className="grid grid-cols-2 text-sm">
                  <div className="border-r border-[#e9dece] px-4 py-4">
                    <p className="font-semibold text-[#12243d]">Box internet</p>
                    <p className="mt-1 text-slate-500">42,90 € / mois</p>
                  </div>
                  <div className="px-4 py-4">
                    <p className="font-semibold text-sage-700">Offre adaptée</p>
                    <p className="mt-1 text-slate-500">29,99 € / mois</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-[#fbf6ed] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                  Aperçu du courrier
                </p>
                <p className="mt-3 text-sm font-semibold text-[#12243d]">
                  Objet : demande de révision de mon offre internet
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Bonjour, après comparaison avec des offres actuellement
                  disponibles, je souhaite revoir les conditions de mon contrat...
                </p>
              </div>

              <Button className="mt-5" href={lettersAccessHref} variant="ghost">
                Voir un exemple complet <ArrowRight size={16} />
              </Button>
            </div>
          </div>

          <div className="grid gap-6">
            {narrativeSteps.map((step, index) => (
              <article
                className="overflow-hidden rounded-[1.4rem] border border-[#e5d8c6] bg-white/82 shadow-soft sm:grid sm:grid-cols-[0.82fr_1fr]"
                key={step.title}
              >
                <div className="relative min-h-56 sm:min-h-full">
                  <Image
                    alt={step.alt}
                    className="object-cover"
                    fill
                    sizes="(min-width: 1024px) 330px, 100vw"
                    src={step.image}
                  />
                  <div className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#fffaf2]/92 text-sm font-bold text-sage-800 shadow-sm backdrop-blur">
                    {index + 1}
                  </div>
                </div>
                <div className="p-7">
                  <h3 className="text-lg font-semibold text-[#12243d]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">
                    {step.text}
                  </p>
                  <p className="mt-6 border-l-2 border-sage-300 pl-3 text-base font-medium leading-7 text-[#425443]">
                    {step.note}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-[4.5rem] sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              COURRIERS EN BONNE ET DUE FORME
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#12243d]">
              Pas besoin de chercher quoi ecrire.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              Le plus dur, ce n'est pas toujours de trouver une meilleure offre. C'est souvent de faire les démarches.
            </p>
            <p className="mt-6 text-lg font-semibold leading-8 text-[#12243d]">
              On vous mache le travail, vous gardez la decision.
            </p>
            <Button className="mt-7" href={startAuditHref}>
              Preparer mes demarches <ArrowRight size={18} />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {letterItems.map((item) => (
              <Card className="bg-white/90 p-5" key={item}>
                <FileText className="text-sage-700" size={22} />
                <p className="mt-4 text-base font-semibold leading-6 text-[#12243d]">
                  {item}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#142238] text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#9bd7b5]">
              Pourquoi pas d'abonnement ?
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Un besoin ponctuel merite un paiement ponctuel.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/72">
              Comparer certains contrats du foyer arrive une ou deux fois par an,
              pas tous les mois. Futeo met donc l'acces par cle au centre du
              parcours : simple, personnel et sans engagement.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {accessItems.map((item) => (
              <Card
                className="border-white/10 bg-white/[0.08] text-white shadow-none"
                key={item.title}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[#9bd7b5]">
                  {item.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {item.text}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-[4.5rem] sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            POUR QUI ?
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-[#12243d]">
            C'est utile si...
          </h2>
          <p className="mt-5 text-lg font-semibold leading-8 text-[#12243d]">
            Futéo n'est pas là pour vous vendre du rêve. Il est là pour vous aider à passer à l'action.
          </p>
        </div>
        <div className="grid gap-4">
          {audienceItems.map((item) => (
            <div
              className="rounded-2xl border border-[#e5d8c6] bg-white/88 px-5 py-4 text-base font-semibold text-slate-700 shadow-sm"
              key={item}
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              SANS FAUSSE PROMESSE
            </p>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-[#12243d]">
              Nous ne promettons pas des économies dans tous les cas.
            </h2>
          </div>
          <div className="space-y-4 text-base leading-8 text-slate-600">
            <p>
              Mais dans beaucoup de situations, il existe des offres plus
              adaptées, parfois moins chères. Le plus dur, c'est de les trouver,
              de comparer, puis de faire les démarches. C'est exactement ce qu'on simplifie.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
          <Card className="bg-white/90">
            <ShieldCheck className="text-sage-700" size={28} />
            <h3 className="mt-4 text-lg font-semibold text-[#12243d]">
              Vous savez ou vous en etes
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Les documents ajoutes deviennent plus lisibles : montant,
              categorie, recurrence et priorite d'action.
            </p>
          </Card>
          <Card className="bg-white/90">
            <FileText className="text-sage-700" size={28} />
            <h3 className="mt-4 text-lg font-semibold text-[#12243d]">
              Vous comparez sans effort
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Pas besoin de refaire tous les calculs a la main. Le service vous
              aide a reperer les contrats qui meritent d'etre revus.
            </p>
          </Card>
          <Card className="bg-white/90">
            <Handshake className="text-sage-700" size={28} />
            <h3 className="mt-4 text-lg font-semibold text-[#12243d]">
              Vous passez a l'action
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Garder, renegocier, resilier ou changer : les pistes deviennent
              des courriers en bonne et due forme, prets a adapter et a relire
              tranquillement.
            </p>
          </Card>
        </div>
      </section>

      <section className="bg-[#fbf6ed] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl rounded-[1.75rem] border border-[#e5d8c6] bg-white/86 px-6 py-12 text-center shadow-soft sm:px-10">
          <h2 className="text-3xl font-bold tracking-tight text-[#12243d]">
            Prenez 5 minutes. Vous verrez déjà plus clair.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Ajoutez vos documents, regardez ce qui peut être amélioré, puis
            choisissez ce que vous voulez faire.
          </p>
          <Button className="mt-7" href={startAuditHref}>
            Commencer maintenant <ArrowRight size={18} />
          </Button>
        </div>
      </section>
    </main>
  );
}
