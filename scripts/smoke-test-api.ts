async function runSmokeTests() {
  const baseUrl = "http://localhost:3000";
  console.log("Démarrage des smoke tests Futéo...");

  const results = {
    landing: false,
    pricing: false,
    checkoutApi: false,
    webhookSecurity: false,
    analysisApi: false
  };

  try {
    console.log("--- 1. Chargement du site ---");
    try {
      const home = await fetch(baseUrl);
      if (home.status === 200) {
        console.log("Site accessible");
        results.landing = true;
      }
    } catch {
      console.warn("Le serveur local ne semble pas tourner sur le port 3000.");
    }

    console.log("--- 2. API Checkout ---");
    try {
      const checkout = await fetch(`${baseUrl}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "foyer",
          planName: "Foyer",
          price: "29"
        })
      });
      const data = (await checkout.json()) as { url?: string; error?: string };
      if (checkout.status === 200 && data.url) {
        console.log("API Checkout opérationnelle");
        results.checkoutApi = true;
      } else {
        console.warn(`API Checkout : ${data.error || "Erreur inconnue"}`);
      }
    } catch {
      console.warn("API Checkout injoignable");
    }

    console.log("--- 3. Sécurité Webhook ---");
    try {
      const webhook = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: "POST",
        body: JSON.stringify({})
      });
      if (webhook.status === 400) {
        console.log("Sécurité Webhook active");
        results.webhookSecurity = true;
      }
    } catch {
      console.warn("Webhook Stripe injoignable");
    }

    console.log("--- 4. API Analyse ---");
    try {
      const analyse = await fetch(`${baseUrl}/api/analyse?code=TEST-KEY`);
      if (analyse.status === 404 || analyse.status === 200) {
        console.log("API Analyse accessible");
        results.analysisApi = true;
      }
    } catch {
      console.warn("API Analyse injoignable");
    }

    console.log("\n--- Bilan ---");
    console.table(results);

    const successCount = Object.values(results).filter(Boolean).length;
    if (successCount >= 3) {
      console.log("Niveau de confiance : élevé, sous réserve de configurer les services externes.");
    } else {
      console.log("Niveau de confiance : moyen. Vérifiez que le serveur tourne.");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("Erreur critique lors des tests:", message);
  }
}

void runSmokeTests();
