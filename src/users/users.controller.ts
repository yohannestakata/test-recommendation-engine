import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService, createUserSchema, updateBehaviorPreferencesSchema, updateUserTraitsSchema } from './users.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const parsed = createUserSchema.parse(body);
      return await this.usersService.create(parsed);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id')
  async updateTraits(@Param('id') id: string, @Body() body: unknown) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('Invalid user id');
    }
    try {
      const parsed = updateUserTraitsSchema.parse(body);
      const updated = await this.usersService.updateTraits(numericId, parsed);
      if (!updated) {
        throw new BadRequestException('User not found');
      }
      return updated;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('Invalid user id');
    }
    return this.usersService.findOne(numericId);
  }

  @Patch(':id/behavior')
  async updateBehaviorPreferences(@Param('id') id: string, @Body() body: unknown) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('Invalid user id');
    }
    try {
      const parsed = updateBehaviorPreferencesSchema.parse(body);
      const updated = await this.usersService.updateBehaviorPreferences(numericId, parsed.behaviorPreferences);
      if (!updated) {
        throw new BadRequestException('User not found');
      }
      return updated;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}

