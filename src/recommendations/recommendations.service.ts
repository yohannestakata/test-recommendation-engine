import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingsService } from "../embeddings/embeddings.service";
import { cosineSimilarity, normalizeVector } from "../common/vector.utils";
import {
  behaviorPreferencesSchema,
  userTraitsSchema,
} from "../users/users.service";
import { z } from "zod";

type InteractionSummary = {
  vendorId: number;
  liked: boolean;
  score: number | null;
};

type VendorWithTraitsAndEmbedding = {
  id: number;
  name: string;
  description: string | null;
  embedding: number[];
  serviceQuality: number;
  interactionStyle: number;
  serviceConduct: number;
  expertise: number;
  environment: number;
  atmosphere: number;
  design: number;
  hospitality: number;
  outcomeQuality: number;
  waitingTime: number;
  physicalElements: number;
  experienceTone: number;
};

type RecommendationItem = {
  vendor: VendorWithTraitsAndEmbedding;
  scores: {
    embeddingScore: number;
    traitScore: number;
    behaviorScore: number;
    finalScore: number;
  };
  debug?: {
    vendorTraitVector: number[];
    prompt?: string;
  };
};

const defaultWeights = {
  embedding: 0.5,
  traits: 0.3,
  behavior: 0.2,
};

const adjustmentsSchema = z
  .object({
    // Personality overrides
    Adventurous: z.number().min(0).max(5).optional(),
    Decisive: z.number().min(0).max(5).optional(),
    Eccentric: z.number().min(0).max(5).optional(),
    Flexible: z.number().min(0).max(5).optional(),
    Loyal: z.number().min(0).max(5).optional(),
    Optimistic: z.number().min(0).max(5).optional(),
    Patient: z.number().min(0).max(5).optional(),
    Perfectionist: z.number().min(0).max(5).optional(),
    Punctual: z.number().min(0).max(5).optional(),
    // Optional weight tuning
    embeddingWeight: z.number().min(0).max(1).optional(),
    traitWeight: z.number().min(0).max(1).optional(),
    behaviorWeight: z.number().min(0).max(1).optional(),
    // Simple behavior preferences override
    behaviorPreferences: behaviorPreferencesSchema.optional(),
  })
  .partial();

export type AdjustmentsInput = z.infer<typeof adjustmentsSchema>;

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService
  ) {}

  private buildUserPromptFromTraits(
    name: string,
    traits: z.infer<typeof userTraitsSchema>,
    behaviorPreferences?: unknown
  ) {
    return [
      `User: ${name}`,
      "Personality traits:",
      `Adventurous: ${traits.adventurous}`,
      `Decisive: ${traits.decisive}`,
      `Eccentric: ${traits.eccentric}`,
      `Flexible: ${traits.flexible}`,
      `Loyal: ${traits.loyal}`,
      `Optimistic: ${traits.optimistic}`,
      `Patient: ${traits.patient}`,
      `Perfectionist: ${traits.perfectionist}`,
      `Punctual: ${traits.punctual}`,
      behaviorPreferences
        ? `Behavior preferences: ${JSON.stringify(behaviorPreferences)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private getUserTraitVector(user: {
    adventurous: number;
    decisive: number;
    eccentric: number;
    flexible: number;
    loyal: number;
    optimistic: number;
    patient: number;
    perfectionist: number;
    punctual: number;
  }): number[] {
    return [
      user.adventurous,
      user.decisive,
      user.eccentric,
      user.flexible,
      user.loyal,
      user.optimistic,
      user.patient,
      user.perfectionist,
      user.punctual,
    ];
  }

  private getVendorTraitVector(vendor: {
    serviceQuality: number;
    interactionStyle: number;
    serviceConduct: number;
    expertise: number;
    environment: number;
    atmosphere: number;
    design: number;
    hospitality: number;
    outcomeQuality: number;
    waitingTime: number;
    physicalElements: number;
    experienceTone: number;
  }): number[] {
    return [
      vendor.serviceQuality,
      vendor.interactionStyle,
      vendor.serviceConduct,
      vendor.expertise,
      vendor.environment,
      vendor.atmosphere,
      vendor.design,
      vendor.hospitality,
      vendor.outcomeQuality,
      vendor.waitingTime,
      vendor.physicalElements,
      vendor.experienceTone,
    ];
  }

  private buildVendorPromptForDebug(vendor: {
    name: string;
    description: string | null;
    serviceQuality: number;
    interactionStyle: number;
    serviceConduct: number;
    expertise: number;
    environment: number;
    atmosphere: number;
    design: number;
    hospitality: number;
    outcomeQuality: number;
    waitingTime: number;
    physicalElements: number;
    experienceTone: number;
  }): string {
    return [
      `Vendor: ${vendor.name}`,
      vendor.description ? `Description: ${vendor.description}` : "",
      "Traits:",
      `Service Quality: ${vendor.serviceQuality}`,
      `Interaction Style: ${vendor.interactionStyle}`,
      `Service Conduct: ${vendor.serviceConduct}`,
      `Expertise: ${vendor.expertise}`,
      `Environment: ${vendor.environment}`,
      `Atmosphere: ${vendor.atmosphere}`,
      `Design: ${vendor.design}`,
      `Hospitality: ${vendor.hospitality}`,
      `Outcome Quality: ${vendor.outcomeQuality}`,
      `Waiting Time: ${vendor.waitingTime}`,
      `Physical Elements: ${vendor.physicalElements}`,
      `Experience Tone: ${vendor.experienceTone}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private computeTraitSimilarity(
    userVector: number[],
    vendorVector: number[]
  ): number {
    const u = normalizeVector(userVector);
    const v = normalizeVector(vendorVector);
    return cosineSimilarity(u, v);
  }

  private computeBehaviorScoreForVendor(params: {
    vendorId: number;
    userInteractions: {
      vendorId: number;
      liked: boolean;
      score: number | null;
    }[];
    vendorTraitVector: number[];
    likedVendorsTraitMap: Map<number, number[]>;
  }): number {
    const {
      vendorId,
      userInteractions,
      vendorTraitVector,
      likedVendorsTraitMap,
    } = params;

    const interaction = userInteractions.find((i) => i.vendorId === vendorId);
    let directScore = 0;
    if (interaction) {
      if (interaction.liked) {
        directScore = 1;
      } else {
        directScore = 0;
      }
    }

    // Similarity to liked vendors (simple collaborative-filter-like behavior)
    const likedVendors = userInteractions.filter(
      (i: InteractionSummary) => i.liked
    );
    let similarityAggregate = 0;
    if (likedVendors.length > 0) {
      let total = 0;
      for (const liked of likedVendors) {
        const likedVector = likedVendorsTraitMap.get(liked.vendorId);
        if (!likedVector) continue;
        total += this.computeTraitSimilarity(vendorTraitVector, likedVector);
      }
      similarityAggregate = total / likedVendors.length;
    }

    // Combine direct preference and similarity to liked vendors
    const behaviorScore = 0.6 * directScore + 0.4 * similarityAggregate;
    return behaviorScore;
  }

  private async computeRecommendations(
    userId: number,
    testMode: boolean,
    adjustmentsRaw: string | undefined,
    options?: { debug?: boolean }
  ) {
    const debug = options?.debug ?? false;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { interactions: true },
    });
    if (!user) {
      return null;
    }

    let adjustments: AdjustmentsInput | undefined;
    if (adjustmentsRaw) {
      try {
        const parsed = JSON.parse(adjustmentsRaw);
        adjustments = adjustmentsSchema.parse(parsed);
      } catch (err) {
        throw new Error(`Invalid adjustments: ${(err as Error).message}`);
      }
    }

    const traits = {
      adventurous: adjustments?.Adventurous ?? user.adventurous,
      decisive: adjustments?.Decisive ?? user.decisive,
      eccentric: adjustments?.Eccentric ?? user.eccentric,
      flexible: adjustments?.Flexible ?? user.flexible,
      loyal: adjustments?.Loyal ?? user.loyal,
      optimistic: adjustments?.Optimistic ?? user.optimistic,
      patient: adjustments?.Patient ?? user.patient,
      perfectionist: adjustments?.Perfectionist ?? user.perfectionist,
      punctual: adjustments?.Punctual ?? user.punctual,
    };

    const weights = {
      embedding: adjustments?.embeddingWeight ?? defaultWeights.embedding,
      traits: adjustments?.traitWeight ?? defaultWeights.traits,
      behavior: adjustments?.behaviorWeight ?? defaultWeights.behavior,
    };

    const weightSum =
      weights.embedding + weights.traits + weights.behavior || 1;
    const normalizedWeights = {
      embedding: weights.embedding / weightSum,
      traits: weights.traits / weightSum,
      behavior: weights.behavior / weightSum,
    };

    const behaviorPreferences =
      adjustments?.behaviorPreferences ?? user.behaviorPreferences ?? undefined;

    const userPrompt = this.buildUserPromptFromTraits(
      user.name,
      traits,
      behaviorPreferences
    );

    let userEmbedding: number[] = user.embedding;
    if (testMode || adjustments) {
      userEmbedding =
        await this.embeddingsService.generateEmbedding(userPrompt);
    }

    const vendors = (await this.prisma.vendor.findMany({
      include: { interactions: true },
    })) as unknown as VendorWithTraitsAndEmbedding[];

    const userTraitVector = this.getUserTraitVector(traits);

    const likedVendorsTraitMap = new Map<number, number[]>();
    for (const vendor of vendors) {
      if (
        user.interactions.some(
          (i: { vendorId: number; liked: boolean }) =>
            i.vendorId === vendor.id && i.liked
        )
      ) {
        likedVendorsTraitMap.set(vendor.id, this.getVendorTraitVector(vendor));
      }
    }

    const userInteractions: InteractionSummary[] = user.interactions.map(
      (i: {
        vendorId: number;
        liked: boolean;
        score: number | null;
      }): InteractionSummary => ({
        vendorId: i.vendorId,
        liked: i.liked,
        score: i.score,
      })
    );

    const results: RecommendationItem[] = vendors.map(
      (vendor: VendorWithTraitsAndEmbedding) => {
        const vendorTraitVector = this.getVendorTraitVector(vendor);

        const embeddingScore = cosineSimilarity(
          userEmbedding,
          vendor.embedding
        );
        const traitScore = this.computeTraitSimilarity(
          userTraitVector,
          vendorTraitVector
        );
        const behaviorScore = this.computeBehaviorScoreForVendor({
          vendorId: vendor.id,
          userInteractions,
          vendorTraitVector,
          likedVendorsTraitMap,
        });

        const finalScore =
          normalizedWeights.embedding * embeddingScore +
          normalizedWeights.traits * traitScore +
          normalizedWeights.behavior * behaviorScore;

        return {
          vendor,
          scores: {
            embeddingScore,
            traitScore,
            behaviorScore,
            finalScore,
          },
          debug: debug
            ? {
                vendorTraitVector,
                prompt: this.buildVendorPromptForDebug(vendor),
              }
            : undefined,
        };
      }
    );

    results.sort(
      (a: RecommendationItem, b: RecommendationItem) =>
        b.scores.finalScore - a.scores.finalScore
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        traits,
        behaviorPreferences,
        weights: normalizedWeights,
        testMode,
        debug: debug
          ? {
              userTraitVector,
              userEmbeddingLength: userEmbedding.length,
              adjustments,
              prompt: userPrompt,
            }
          : undefined,
      },
      recommendations: results,
    };
  }

  async getRecommendations(
    userId: number,
    testMode: boolean,
    adjustmentsRaw?: string
  ) {
    return this.computeRecommendations(userId, testMode, adjustmentsRaw, {
      debug: false,
    });
  }

  async getRecommendationsDebug(
    userId: number,
    testMode: boolean,
    adjustmentsRaw?: string
  ) {
    return this.computeRecommendations(userId, testMode, adjustmentsRaw, {
      debug: true,
    });
  }
}
