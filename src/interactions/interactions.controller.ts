import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InteractionsService, interactionSchema } from './interactions.service';

@ApiTags('interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  async upsert(@Body() body: unknown) {
    try {
      const parsed = interactionSchema.parse(body);
      const result = await this.interactionsService.upsertInteraction(parsed);
      if (!result) {
        throw new BadRequestException('User or vendor not found');
      }
      return result;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException((err as Error).message);
    }
  }

  @Get('user/:userId')
  async listForUser(@Param('userId') userId: string) {
    const numericId = Number(userId);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('Invalid user id');
    }
    return this.interactionsService.listForUser(numericId);
  }
}


