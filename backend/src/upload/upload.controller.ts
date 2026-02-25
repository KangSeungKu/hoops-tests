import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

/** 다이렉트 스트리밍 가능 확장자 (SC/SCS/SCZ). Config modelDirs/fileServerStaticDirs에서 서빙 */
const DIRECT_STREAM_EXTENSIONS = ['.sc', '.xml', '.scs', '.scz'];

/** 변환 후 스트리밍할 확장자 (HOOPS Converter 사용) */
const CONVERT_EXTENSIONS = ['.dwg', '.step', '.stp', '.iges', '.igs'];

@Controller('api')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File): Promise<{ modelId: string }> {
    if (!file?.originalname) {
      throw new BadRequestException('파일이 없습니다.');
    }
    const ext = this.getExtension(file.originalname);
    const allAllowed = [...DIRECT_STREAM_EXTENSIONS, ...CONVERT_EXTENSIONS];
    if (!allAllowed.includes(ext)) {
      throw new BadRequestException(
        `허용 확장자: 다이렉트 스트리밍 ${DIRECT_STREAM_EXTENSIONS.join(', ')} / 변환 ${CONVERT_EXTENSIONS.join(', ')}`,
      );
    }
    const modelId = CONVERT_EXTENSIONS.includes(ext)
      ? await this.uploadService.convertAndReturnModelId(file)
      : await this.uploadService.saveAndReturnModelId(file);
    return { modelId };
  }

  private getExtension(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i).toLowerCase() : '';
  }
}
