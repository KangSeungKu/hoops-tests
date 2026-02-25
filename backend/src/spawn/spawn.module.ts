import { Module } from '@nestjs/common';
import { SpawnController } from './spawn.controller';
import { SpawnService } from './spawn.service';

@Module({
  controllers: [SpawnController],
  providers: [SpawnService],
})
export class SpawnModule {}
