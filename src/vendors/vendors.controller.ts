import { BadRequestException, Controller, Get, Param, Post, Body } from '@nestjs/common';
import { VendorsService, createVendorSchema } from './vendors.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const parsed = createVendorSchema.parse(body);
      return await this.vendorsService.create(parsed);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Get()
  async findAll() {
    return this.vendorsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException('Invalid vendor id');
    }
    return this.vendorsService.findOne(numericId);
  }
}


