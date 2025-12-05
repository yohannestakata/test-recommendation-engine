import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get(':userId')
  async getRecommendations(
    @Param('userId') userId: string,
    @Query('testMode') testMode?: string,
    @Query('adjustments') adjustments?: string,
  ) {
    const numericId = Number(userId);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('Invalid user id');
    }

    const isTestMode = testMode === 'true';

    try {
      const result = await this.recommendationsService.getRecommendations(numericId, isTestMode, adjustments);
      if (!result) {
        throw new BadRequestException('User not found');
      }
      return result;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}


