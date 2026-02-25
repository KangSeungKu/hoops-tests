import { Module } from '@nestjs/common';
import { SpawnModule } from './spawn/spawn.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [SpawnModule, UploadModule],
})
export class AppModule {}
