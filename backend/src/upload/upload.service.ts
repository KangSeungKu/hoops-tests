import { Injectable } from '@nestjs/common';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const CONVERTER_BIN = process.env.CONVERTER_BIN || '/app/converter/bin/converter';
const CONVERTER_LICENSE = process.env.HOOPSS_LICENSE || process.env.CONVERTER_LICENSE || '';

@Injectable()
export class UploadService {
  /**
   * 업로드된 파일을 UPLOAD_DIR에 저장하고, 스트리밍 시 사용할 modelId(확장자 제외 파일명)를 반환합니다.
   */
  async saveAndReturnModelId(file: Express.Multer.File): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = this.sanitizeFilename(file.originalname);
    const destPath = join(UPLOAD_DIR, safeName);
    await writeFile(destPath, file.buffer, { flag: 'w' });
    return safeName.replace(/\.[^.]+$/, '');
  }

  /**
   * DWG/STEP/IGES 등 업로드 파일을 HOOPS Converter로 SC 형식으로 변환한 뒤 modelId 반환.
   * 변환 결과는 UPLOAD_DIR에 저장되어 hoops-spawn이 스트리밍합니다.
   */
  async convertAndReturnModelId(file: Express.Multer.File): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = this.sanitizeFilename(file.originalname);
    const inputPath = join(UPLOAD_DIR, safeName);
    await writeFile(inputPath, file.buffer, { flag: 'w' });
    const baseName = safeName.replace(/\.[^.]+$/, '');
    const outputScPath = join(UPLOAD_DIR, baseName);

    if (!CONVERTER_LICENSE) {
      throw new Error('변환을 위해 HOOPSS_LICENSE(또는 CONVERTER_LICENSE) 환경 변수가 필요합니다.');
    }

    const result = await this.runConverter(inputPath, outputScPath);
    if (result.success) {
      return baseName;
    }
    // 상세 원인 로그 (서버 콘솔)
    console.error('[upload] Converter failed:', {
      exitCode: result.exitCode,
      spawnError: result.spawnError ?? null,
      stdout: result.stdout?.slice(0, 2000) ?? '',
      stderr: result.stderr?.slice(0, 2000) ?? '',
    });
    // 사용자에게 보여줄 오류 메시지 (DWG 등 변환 실패 시 화면에 그대로 노출)
    const stderrTrim = result.stderr?.trim() ?? '';
    const isLicenseError = /license|License|does not support|Unable to initialize/i.test(stderrTrim);
    let msg: string;
    if (result.spawnError) {
      msg = `Converter 실행 불가: ${result.spawnError}. (CONVERTER_BIN 확인)`;
    } else if (isLicenseError) {
      msg = [
        'DWG/STEP/IGES 파일은 변환 후에만 스트리밍됩니다.',
        '현재 라이선스가 변환을 지원하지 않습니다.',
        '→ SC/SCS/SCZ 파일만 업로드해 주세요.',
        '',
        '[상세] ' + stderrTrim.split('\n').slice(-2).join(' ').replace(/\s+/g, ' ').slice(0, 180),
      ].join('\n');
    } else if (stderrTrim) {
      msg = '변환 실패:\n' + stderrTrim.split('\n').slice(-3).join('\n').slice(0, 400);
    } else if (result.exitCode != null) {
      msg = `변환 실패 (exit code ${result.exitCode}). 서버 로그 [upload] Converter failed 를 확인하세요.`;
    } else {
      msg = 'HOOPS Converter 실행 실패. 로그를 확인하세요.';
    }
    throw new Error(msg);
  }

  private runConverter(
    inputPath: string,
    outputScPath: string,
  ): Promise<{ success: boolean; exitCode: number | null; spawnError?: string; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const args = [
        '--input', inputPath,
        '--output_sc', outputScPath,
        '--license', CONVERTER_LICENSE,
      ];
      let stdout = '';
      let stderr = '';
      const proc = spawn(CONVERTER_BIN, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('close', (code, signal) => {
        resolve({
          success: code === 0,
          exitCode: code ?? null,
          stdout,
          stderr,
        });
      });
      proc.on('error', (err: NodeJS.ErrnoException) => {
        const msg = err.code === 'ENOENT'
          ? `Converter not found: ${CONVERTER_BIN}`
          : err.message;
        console.error('[upload] Converter spawn error:', msg);
        resolve({
          success: false,
          exitCode: null,
          spawnError: msg,
          stdout,
          stderr,
        });
      });
    });
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
