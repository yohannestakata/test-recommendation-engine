import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsDebugController } from './recommendations-debug.controller';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [EmbeddingsModule],
  controllers: [RecommendationsController, RecommendationsDebugController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}


