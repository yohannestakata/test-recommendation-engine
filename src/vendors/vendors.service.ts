import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { z } from 'zod';

export const vendorTraitsSchema = z.object({
  serviceQuality: z.number().min(0).max(5),
  interactionStyle: z.number().min(0).max(5),
  serviceConduct: z.number().min(0).max(5),
  expertise: z.number().min(0).max(5),
  environment: z.number().min(0).max(5),
  atmosphere: z.number().min(0).max(5),
  design: z.number().min(0).max(5),
  hospitality: z.number().min(0).max(5),
  outcomeQuality: z.number().min(0).max(5),
  waitingTime: z.number().min(0).max(5),
  physicalElements: z.number().min(0).max(5),
  experienceTone: z.number().min(0).max(5),
});

export const createVendorSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  traits: vendorTraitsSchema,
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  private buildVendorPrompt(input: CreateVendorInput): string {
    const t = input.traits;
    return [
      `Vendor: ${input.name}`,
      input.description ? `Description: ${input.description}` : '',
      'Traits:',
      `Service Quality: ${t.serviceQuality}`,
      `Interaction Style: ${t.interactionStyle}`,
      `Service Conduct: ${t.serviceConduct}`,
      `Expertise: ${t.expertise}`,
      `Environment: ${t.environment}`,
      `Atmosphere: ${t.atmosphere}`,
      `Design: ${t.design}`,
      `Hospitality: ${t.hospitality}`,
      `Outcome Quality: ${t.outcomeQuality}`,
      `Waiting Time: ${t.waitingTime}`,
      `Physical Elements: ${t.physicalElements}`,
      `Experience Tone: ${t.experienceTone}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async create(input: CreateVendorInput) {
    const prompt = this.buildVendorPrompt(input);
    const embedding = await this.embeddingsService.generateEmbedding(prompt);

    return this.prisma.vendor.create({
      data: {
        name: input.name,
        description: input.description,
        ...input.traits,
        embedding,
      },
    });
  }

  async findAll() {
    return this.prisma.vendor.findMany();
  }

  async findOne(id: number) {
    return this.prisma.vendor.findUnique({ where: { id } });
  }
}


