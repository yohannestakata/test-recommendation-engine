import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { VendorsModule } from './vendors/vendors.module';
import { UsersModule } from './users/users.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { InteractionsModule } from './interactions/interactions.module';

@Module({
  imports: [PrismaModule, EmbeddingsModule, VendorsModule, UsersModule, RecommendationsModule, InteractionsModule],
})
export class AppModule {}



