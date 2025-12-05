import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

export const userTraitsSchema = z.object({
  adventurous: z.number().min(0).max(5),
  decisive: z.number().min(0).max(5),
  eccentric: z.number().min(0).max(5),
  flexible: z.number().min(0).max(5),
  loyal: z.number().min(0).max(5),
  optimistic: z.number().min(0).max(5),
  patient: z.number().min(0).max(5),
  perfectionist: z.number().min(0).max(5),
  punctual: z.number().min(0).max(5),
});

export const vendorTraitPreferenceSchema = z
  .object({
    serviceQuality: z.number().min(0).max(1).optional(),
    interactionStyle: z.number().min(0).max(1).optional(),
    serviceConduct: z.number().min(0).max(1).optional(),
    expertise: z.number().min(0).max(1).optional(),
    environment: z.number().min(0).max(1).optional(),
    atmosphere: z.number().min(0).max(1).optional(),
    design: z.number().min(0).max(1).optional(),
    hospitality: z.number().min(0).max(1).optional(),
    outcomeQuality: z.number().min(0).max(1).optional(),
    waitingTime: z.number().min(0).max(1).optional(),
    physicalElements: z.number().min(0).max(1).optional(),
    experienceTone: z.number().min(0).max(1).optional(),
  })
  .partial();

export const behaviorPreferencesSchema = z.object({
  notes: z.string().optional(),
  recentPattern: z.string().optional(),
  vendorTraitWeights: vendorTraitPreferenceSchema.optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  traits: userTraitsSchema,
  behaviorPreferences: behaviorPreferencesSchema.optional(),
  isTestUser: z.boolean().optional(),
});

export const updateUserTraitsSchema = z.object({
  traits: userTraitsSchema.partial().refine((val) => Object.keys(val).length > 0, {
    message: 'At least one trait must be provided',
  }),
  behaviorPreferences: behaviorPreferencesSchema.optional(),
});

export const updateBehaviorPreferencesSchema = z.object({
  behaviorPreferences: behaviorPreferencesSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type BehaviorPreferencesInput = z.infer<typeof behaviorPreferencesSchema>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  private buildUserPrompt(input: { name: string; traits: z.infer<typeof userTraitsSchema>; behaviorPreferences?: unknown; isTestUser?: boolean }): string {
    const t = input.traits;
    return [
      `User: ${input.name}`,
      input.isTestUser ? 'This is a test user for behavior experiments.' : '',
      'Personality traits:',
      `Adventurous: ${t.adventurous}`,
      `Decisive: ${t.decisive}`,
      `Eccentric: ${t.eccentric}`,
      `Flexible: ${t.flexible}`,
      `Loyal: ${t.loyal}`,
      `Optimistic: ${t.optimistic}`,
      `Patient: ${t.patient}`,
      `Perfectionist: ${t.perfectionist}`,
      `Punctual: ${t.punctual}`,
      input.behaviorPreferences ? `Behavior preferences: ${JSON.stringify(input.behaviorPreferences)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async create(input: CreateUserInput) {
    const prompt = this.buildUserPrompt({
      name: input.name,
      traits: input.traits,
      behaviorPreferences: input.behaviorPreferences,
      isTestUser: input.isTestUser,
    });
    const embedding = await this.embeddingsService.generateEmbedding(prompt);

    return this.prisma.user.create({
      data: {
        name: input.name,
        ...input.traits,
        embedding,
        behaviorPreferences: input.behaviorPreferences ?? null,
        isTestUser: input.isTestUser ?? false,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany();
  }

  async findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { interactions: true },
    });
  }

  async updateTraits(id: number, input: z.infer<typeof updateUserTraitsSchema>) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }

    const updatedTraits = {
      adventurous: input.traits.adventurous ?? existing.adventurous,
      decisive: input.traits.decisive ?? existing.decisive,
      eccentric: input.traits.eccentric ?? existing.eccentric,
      flexible: input.traits.flexible ?? existing.flexible,
      loyal: input.traits.loyal ?? existing.loyal,
      optimistic: input.traits.optimistic ?? existing.optimistic,
      patient: input.traits.patient ?? existing.patient,
      perfectionist: input.traits.perfectionist ?? existing.perfectionist,
      punctual: input.traits.punctual ?? existing.punctual,
    };

    const prompt = this.buildUserPrompt({
      name: existing.name,
      traits: updatedTraits,
      behaviorPreferences: input.behaviorPreferences ?? existing.behaviorPreferences ?? undefined,
      isTestUser: existing.isTestUser,
    });
    const embedding = await this.embeddingsService.generateEmbedding(prompt);

    return this.prisma.user.update({
      where: { id },
      data: {
        ...updatedTraits,
        embedding,
        behaviorPreferences: input.behaviorPreferences ?? existing.behaviorPreferences,
      },
    });
  }

  async updateBehaviorPreferences(id: number, behaviorPreferences: BehaviorPreferencesInput) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }

    const traits = {
      adventurous: existing.adventurous,
      decisive: existing.decisive,
      eccentric: existing.eccentric,
      flexible: existing.flexible,
      loyal: existing.loyal,
      optimistic: existing.optimistic,
      patient: existing.patient,
      perfectionist: existing.perfectionist,
      punctual: existing.punctual,
    };

    const prompt = this.buildUserPrompt({
      name: existing.name,
      traits,
      behaviorPreferences,
      isTestUser: existing.isTestUser,
    });
    const embedding = await this.embeddingsService.generateEmbedding(prompt);

    return this.prisma.user.update({
      where: { id },
      data: {
        behaviorPreferences,
        embedding,
      },
    });
  }
}

