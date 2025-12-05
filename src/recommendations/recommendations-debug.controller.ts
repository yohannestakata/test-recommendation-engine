import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations-debug')
@Controller('debug/recommendations')
export class RecommendationsDebugController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get(':userId')
  async getRecommendationsDebug(
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
      const result = await this.recommendationsService.getRecommendationsDebug(numericId, isTestMode, adjustments);
      if (!result) {
        throw new BadRequestException('User not found');
      }
      return result;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}


