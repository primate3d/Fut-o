import { Resend } from "resend";

export async function sendAccessKeyEmail(
  to: string,
  keyCode: string,
  planName: string
) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY manquante. Envoi de mail simule.");
    console.log(`[MAIL LOCAL] Vers: ${to}, Cle: ${keyCode}, Plan: ${planName}`);
    return { success: true, simulated: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: "Futéo <onboarding@resend.dev>",
      to: [to],
      subject: "Votre clé d'accès Futéo est prête",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eadfce; border-radius: 16px; background-color: #fffaf2;">
          <h1 style="color: #12243d; font-size: 24px;">Votre accès Futéo est prêt</h1>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
            Votre paiement pour le plan <strong>${planName}</strong> a été confirmé.
            Vous pouvez utiliser la clé ci-dessous pour ouvrir votre espace.
          </p>

          <div style="background-color: #ffffff; border: 1px solid #9bd7b5; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #718096; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Votre clé personnelle</p>
            <h2 style="margin: 10px 0 0; font-size: 28px; color: #12243d; font-family: monospace;">${keyCode}</h2>
          </div>

          <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">
            Ajoutez uniquement les documents utiles à votre audit. Vous gardez la main sur les éléments transmis et les démarches à lancer.
          </p>

          <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/tableau-de-bord"
             style="display: block; background-color: #12243d; color: #ffffff; text-align: center; padding: 16px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Accéder à mon espace
          </a>
        </div>
      `
    });

    if (error) {
      console.error("Erreur Resend:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Erreur envoi mail:", error);
    return { success: false, error };
  }
}
