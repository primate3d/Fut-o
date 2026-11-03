import OpenAI from "openai";
import { z } from "zod";
import type {
  CommercialEvidence,
  CommercialOfferInterpreter,
  InternetOffer,
  InternetTechnology,
} from "./types";
import { getCommercialOfferId } from "./validate";

const aiOfferSchema = z.object({
  offerName: z.string().min(1),
  technology: z.enum(["FIBER", "CABLE", "ADSL", "VDSL", "MIXED", "UNKNOWN"]),
  monthlyPrice: z.number().nonnegative().nullable(),
  promotionPrice: z.number().nonnegative().nullable(),
  promotionDurationMonths: z.number().int().nonnegative().nullable(),
  priceAfterPromotion: z.number().nonnegative().nullable(),
  commitmentMonths: z.number().int().nonnegative().nullable(),
  activationFees: z.number().nonnegative().nullable(),
  terminationFees: z.number().nonnegative().nullable(),
  downloadMbps: z.number().nonnegative().nullable(),
  uploadMbps: z.number().nonnegative().nullable(),
  includedServices: z.array(z.string()),
  eligibilityConditions: z.array(z.string()),
  conditions: z.array(z.string()),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  evidence: z.array(z.object({ field: z.string(), excerpt: z.string().min(1) })),
});

const aiResponseSchema = z.object({ offers: z.array(aiOfferSchema) });

function corroboratedEvidence(
  evidence: z.infer<typeof aiOfferSchema>["evidence"],
  content: string,
  sourceUrl: string,
  capturedAt: string,
): CommercialEvidence[] {
  const normalizedContent = content.replace(/\s+/g, " ").toLowerCase();
  return evidence
    .filter((item) => normalizedContent.includes(item.excerpt.replace(/\s+/g, " ").toLowerCase()))
    .map((item) => ({
      field: item.field,
      excerpt: item.excerpt,
      sourceUrl,
      capturedAt,
    }));
}

export class OpenAiCommercialInterpreter implements CommercialOfferInterpreter {
  private readonly client: OpenAI;
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly maxCalls: number,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  getUsage() {
    return {
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
    };
  }

  async interpretInternetOffers({ source, content, retrievedAt }: Parameters<
    CommercialOfferInterpreter["interpretInternetOffers"]
  >[0]): Promise<InternetOffer[]> {
    if (this.calls >= this.maxCalls) {
      throw new Error("Budget maximal d'appels IA du catalogue atteint.");
    }
    this.calls += 1;
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      max_completion_tokens: 4_000,
      messages: [
        {
          role: "system",
          content: [
            "Structure uniquement les offres Internet presentes dans le texte commercial officiel.",
            "N'invente aucune valeur. Utilise null lorsqu'une information manque.",
            "Chaque valeur doit citer un extrait exact du texte dans evidence.",
            "Retourne un objet JSON { offers: [...] } conforme au schema demande.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            provider: source.provider,
            sourceUrl: source.sourceUrl,
            content: content.slice(0, 40_000),
          }),
        },
      ],
    });
    this.inputTokens += response.usage?.prompt_tokens ?? 0;
    this.outputTokens += response.usage?.completion_tokens ?? 0;
    const parsed = aiResponseSchema.parse(
      JSON.parse(response.choices[0]?.message.content ?? "{}"),
    );
    return parsed.offers.map((candidate) => {
      const proof = corroboratedEvidence(
        candidate.evidence,
        content,
        source.sourceUrl,
        retrievedAt,
      );
      return {
        ...candidate,
        catalogId: getCommercialOfferId(
          "internet",
          source.provider,
          candidate.offerName,
          source.sourceUrl,
        ),
        sector: "internet" as const,
        provider: source.provider,
        sourceUrl: source.sourceUrl,
        retrievedAt,
        verifiedAt: null,
        verificationStatus: "PARTIAL" as const,
        extractionMethod: "ai" as const,
        technology: candidate.technology as InternetTechnology,
        promotionConditions: [],
        activationFeeRefund: null,
        activationFeeRefundConditional: false,
        evidence: proof,
      };
    });
  }
}
