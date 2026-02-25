import { Body, Controller, Post } from '@nestjs/common';
import { SpawnRequestDto } from './dto/spawn-request.dto';
import { SpawnService, SpawnResult } from './spawn.service';

@Controller('api')
export class SpawnController {
  constructor(private readonly spawnService: SpawnService) {}

  @Post('spawn')
  async spawn(@Body() dto: SpawnRequestDto): Promise<SpawnResult> {
    return this.spawnService.spawn(dto.modelId ?? '', dto.rendererType ?? 'csr');
  }
}
