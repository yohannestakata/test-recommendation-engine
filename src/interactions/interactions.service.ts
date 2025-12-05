import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export const interactionSchema = z.object({
  userId: z.number().int().positive(),
  vendorId: z.number().int().positive(),
  liked: z.boolean(),
  score: z.number().int().min(1).max(5).optional(),
});

export type InteractionInput = z.infer<typeof interactionSchema>;

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertInteraction(input: InteractionInput) {
    const { userId, vendorId, liked, score } = input;

    // Ensure user and vendor exist (basic safety)
    const [user, vendor] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.vendor.findUnique({ where: { id: vendorId } }),
    ]);

    if (!user || !vendor) {
      return null;
    }

    return this.prisma.interaction.upsert({
      where: {
        userId_vendorId: { userId, vendorId },
      },
      update: {
        liked,
        score: score ?? null,
      },
      create: {
        userId,
        vendorId,
        liked,
        score: score ?? null,
      },
    });
  }

  async listForUser(userId: number) {
    return this.prisma.interaction.findMany({
      where: { userId },
      include: {
        vendor: true,
      },
    });
  }
}


