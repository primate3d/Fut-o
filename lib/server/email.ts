type EmailResult =
  | { success: true; data?: unknown; simulated?: boolean }
  | { success: false; error: unknown };

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const fromEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const fromName = process.env.BREVO_FROM_NAME?.trim() || "Futéo";

  return {
    apiKey,
    fromEmail,
    fromName,
    hasApiKey: Boolean(apiKey),
    hasFromEmail: Boolean(fromEmail)
  };
}

function isValidEmail(value?: string) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function parseBrevoResponse(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function maskKeyForLog(keyCode: string) {
  return `****${keyCode.slice(-4)}`;
}

function buildAccessKeyEmail(keyCode: string, planName: string) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eadfce; border-radius: 16px; background-color: #fffaf2;">
      <h1 style="color: #12243d; font-size: 24px;">Votre accès Futéo est prêt</h1>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
        Votre accès <strong>${planName}</strong> est prêt.
        Vous pouvez utiliser la clé ci-dessous pour ouvrir votre espace.
      </p>

      <div style="background-color: #ffffff; border: 1px solid #9bd7b5; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center;">
        <p style="margin: 0; font-size: 14px; color: #718096; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Votre clé personnelle</p>
        <h2 style="margin: 10px 0 0; font-size: 28px; color: #12243d; font-family: monospace;">${keyCode}</h2>
      </div>

      <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">
        Ajoutez uniquement les documents utiles à votre audit. Vous gardez la main sur les éléments transmis et les démarches à lancer.
      </p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/activer-cle"
         style="display: block; background-color: #12243d; color: #ffffff; text-align: center; padding: 16px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
        Activer ma clé
      </a>
    </div>
  `;
}

export async function sendAccessKeyEmail(
  to: string,
  keyCode: string,
  planName: string
): Promise<EmailResult> {
  const { apiKey, fromEmail, fromName, hasApiKey, hasFromEmail } = getBrevoConfig();

  console.info("Configuration Brevo détectée:", {
    hasApiKey,
    hasFromEmail,
    fromEmail,
    fromName,
    nodeEnv: process.env.NODE_ENV
  });

  if (!apiKey || !fromEmail) {
    const error = "Configuration Brevo manquante : BREVO_API_KEY et BREVO_FROM_EMAIL sont requis.";
    if (process.env.NODE_ENV !== "production") {
      console.warn(error);
      console.log(`[MAIL LOCAL] Vers: ${to}, Cle: ${maskKeyForLog(keyCode)}, Plan: ${planName}`);
      return { success: true, simulated: true };
    }

    console.error("Echec configuration Brevo:", {
      error,
      hasApiKey,
      hasFromEmail,
      fromEmail,
      planName
    });
    return { success: false, error };
  }

  if (!isValidEmail(fromEmail)) {
    const error = "Configuration Brevo invalide : BREVO_FROM_EMAIL doit être une adresse email valide.";
    console.error("Echec configuration Brevo:", { error, fromEmail, planName });
    return { success: false, error };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          email: fromEmail,
          name: fromName
        },
        to: [{ email: to }],
        subject: "Votre clé d'accès Futéo est prête",
        htmlContent: buildAccessKeyEmail(keyCode, planName)
      })
    });

    const responseText = await response.text();
    const responseBody = parseBrevoResponse(responseText);

    if (!response.ok) {
      console.error("Echec envoi Brevo:", {
        status: response.status,
        statusText: response.statusText,
        response: responseBody,
        fromEmail,
        to,
        planName
      });
      return { success: false, error: responseBody ?? response.statusText };
    }

    return { success: true, data: responseBody };
  } catch (error) {
    console.error("Erreur appel Brevo:", { error, fromEmail, to, planName });
    return { success: false, error };
  }
}
