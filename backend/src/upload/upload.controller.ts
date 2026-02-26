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

/**
 * 변환 후 스트리밍할 확장자 (HOOPS Converter 사용).
 * HOOPS/중립: hsf, prc, obj, stl, u3d, wrl, 3mf, gltf, glb, fbx, dae, 3dpdf
 * AutoCAD: dwg, dxf, dgn | CATIA: model, session, catdrawing, catpart, catproduct, 3dxml
 * BIM: ifc, ifczip, rvt, rfa, nwd | Mechanical: sldprt, sldasm, par, asm, prt, ipt, iam, jt, stp, step, igs
 * Point Cloud: pts, ptx, xyz | 3D PDF: pdf
 */
const CONVERT_EXTENSIONS = [
  '.hsf', '.prc', '.obj', '.stl', '.u3d', '.wrl', '.3mf', '.gltf', '.glb', '.fbx', '.dae', '.3dpdf', '.pdf',
  '.dwg', '.dxf', '.dgn',
  '.model', '.session', '.catdrawing', '.catpart', '.catproduct', '.3dxml',
  '.ifc', '.ifczip', '.rvt', '.rfa', '.nwd',
  '.sldprt', '.sldasm', '.par', '.asm', '.prt', '.ipt', '.iam', '.jt', '.stp', '.step', '.igs',
  '.pts', '.ptx', '.xyz',
];

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
        `지원하지 않는 확장자입니다. 다이렉트: .sc, .scs, .scz, .xml / 변환: dwg, dxf, ifc, hsf, step, stl, obj, fbx, gltf, glb 등 (전체 목록은 API 문서 참고)`,
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
