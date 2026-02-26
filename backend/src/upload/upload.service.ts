import { Injectable } from '@nestjs/common';
import { writeFile, mkdir, copyFile, access, readdir, stat, rm, rename } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import { constants } from 'fs';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const CONVERTER_BIN = process.env.CONVERTER_BIN || '/app/converter/bin/converter';
const CONVERTER_LICENSE = process.env.HOOPSS_LICENSE || process.env.CONVERTER_LICENSE || '';
/** 1 이면 변환 결과를 SCZ(압축)로 출력. 기본은 SC */
const CONVERT_OUTPUT_SCZ = process.env.CONVERT_OUTPUT_SCZ === '1' || process.env.CONVERT_OUTPUT_SCZ === 'true';

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

    const inputExt = (safeName.match(/\.[^.]+$/) ?? [''])[0].toLowerCase();
    if (inputExt === '.hsf') {
      return this.convertHsfShattered(inputPath, UPLOAD_DIR, baseName);
    }
    let result = await this.runConverter(inputPath, outputScPath);
    if (result.success) {
      await this.logConversionOutputLayout(UPLOAD_DIR, baseName, inputExt);
      await this.ensureMasterScForStreaming(UPLOAD_DIR, baseName);
      const masterSc = join(UPLOAD_DIR, `${baseName}.sc`);
      const masterScz = join(UPLOAD_DIR, `${baseName}.scz`);
      let hasMaster = await access(masterSc, constants.F_OK).then(() => true).catch(() => false)
        || await access(masterScz, constants.F_OK).then(() => true).catch(() => false);
      // response_04: 단일 .sc 파일은 지원되지 않음. --output_sc <path>.sc 는 디렉터리 <path>.sc/ 를 만듦. 단일 파일이 필요하면 --sc_create_scz true 로 .scz 사용.
      if (!hasMaster) {
        const shatteredOnlyExts = ['.hsf', '.catpart', '.catproduct', '.model', '.session', '.sldprt', '.sldasm', '.par', '.asm', '.prt', '.ipt', '.iam'];
        if (shatteredOnlyExts.includes(inputExt)) {
          // 1) 단일 파일이 필요하면 SCZ 재시도 (response_04: .scz 가 진짜 단일 파일)
          if (!CONVERT_OUTPUT_SCZ) {
            const sczResult = await this.runConverterWithArgs([
              '--input', inputPath,
              '--output_sc', outputScPath,
              '--sc_create_scz', 'true',
              '--license', CONVERTER_LICENSE,
            ]);
            if (sczResult.success) {
              const sczExists = await access(masterScz, constants.F_OK).then(() => true).catch(() => false);
              if (sczExists) {
                hasMaster = true;
                console.log('[upload] single-file .scz fallback succeeded (response_04)', { baseName, inputExt });
              }
            }
          }
          // 2) SCZ 실패 또는 이미 SC 모드: .sc 경로 시도 → 디렉터리 생성 시 내부 마스터를 루트로 복사
          if (!hasMaster) {
            const singleResult = await this.runConverterWithArgs([
              '--input', inputPath,
              '--output_sc', masterSc,
              '--license', CONVERTER_LICENSE,
            ]);
            if (singleResult.success) {
              try {
                const st = await stat(masterSc);
                if (st.isFile()) {
                  hasMaster = true;
                  console.log('[upload] single-file .sc fallback succeeded', { baseName, inputExt });
                } else if (st.isDirectory()) {
                  const innerSc = join(masterSc, `${baseName}.sc`);
                  const innerExists = await access(innerSc, constants.F_OK).then(() => true).catch(() => false);
                  if (innerExists) {
                    const tmpFile = join(UPLOAD_DIR, `${baseName}.sc.tmp`);
                    await copyFile(innerSc, tmpFile);
                    await rm(masterSc, { recursive: true });
                    await rename(tmpFile, masterSc);
                    hasMaster = true;
                    console.log('[upload] single-file fallback produced directory; replaced with inner master', { baseName, inputExt });
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        }
      }
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
        '지원 3D 포맷(ifc, hsf, dwg, step, stl 등)은 변환 후에만 스트리밍됩니다.',
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

  /**
   * HSF는 shattered 출력만 생성하고 마스터 .sc를 만들지 않음.
   * response_02/04: --output_sc 는 디렉터리 생성. 단일 파일은 SCZ(--sc_create_scz). 먼저 시도 후, 실패 시 shattered 워크플로.
   */
  private async convertHsfShattered(inputPath: string, uploadDir: string, baseName: string): Promise<string> {
    const masterAtRoot = join(uploadDir, `${baseName}.sc`);
    const masterScz = join(uploadDir, `${baseName}.scz`);
    const outputScPath = join(uploadDir, baseName);
    const fileExists = async (p: string) => access(p, constants.F_OK).then(() => true).catch(() => false);

    // CONVERT_OUTPUT_SCZ=1 이면 먼저 단일 .scz 생성 시도 → bnc.scz 하나만 남김 (bnc/, bnc.sc/ 미생성)
    if (CONVERT_OUTPUT_SCZ) {
      console.log('[upload] HSF SCZ attempt', { baseName, outputScPath, masterScz, CONVERT_OUTPUT_SCZ: true });
      const sczResult = await this.runConverterWithArgs([
        '--input', inputPath,
        '--output_sc', outputScPath,
        '--sc_create_scz', 'true',
        '--license', CONVERTER_LICENSE,
      ]);
      if (sczResult.success) {
        // 공식: --output_sc /path/model → /path/model.scz. 일부 환경에서는 /path/model/model.scz 로 나올 수 있음.
        const sczAtRoot = await fileExists(masterScz);
        const sczInDir = await fileExists(join(outputScPath, `${baseName}.scz`));
        if (sczAtRoot) {
          console.log('[upload] HSF converted to single .scz (CONVERT_OUTPUT_SCZ)', { baseName });
          return baseName;
        }
        if (sczInDir) {
          await copyFile(join(outputScPath, `${baseName}.scz`), masterScz);
          await rm(outputScPath, { recursive: true }).catch(() => {});
          console.log('[upload] HSF .scz was in subdir; moved to root', { baseName });
          return baseName;
        }
        // Converter exit 0 이지만 .scz 미생성 → HSF 입력 시 --sc_create_scz 가 무시되고 SC 디렉터리만 나온 경우
        let outputDirContents: string[] = [];
        try {
          outputDirContents = await readdir(outputScPath);
        } catch {
          // outputScPath 가 디렉터리가 아닐 수 있음
        }
        console.warn('[upload] HSF SCZ run succeeded but no .scz file found; Converter may not support SCZ for HSF input', {
          baseName,
          sczAtRoot,
          sczInDir,
          outputDirContents: outputDirContents.slice(0, 20),
        });
      } else {
        console.warn('[upload] HSF SCZ conversion failed (will try SC/shattered)', {
          baseName,
          exitCode: sczResult.exitCode,
          stderr: sczResult.stderr?.slice(-500),
        });
      }
    }

    const singleFileSc = await this.runConverterWithArgs([
      '--input', inputPath,
      '--output_sc', masterAtRoot,
      '--license', CONVERTER_LICENSE,
    ]);
    if (singleFileSc.success) {
      try {
        const st = await stat(masterAtRoot);
        if (st.isFile()) {
          console.log('[upload] HSF single-file .sc created', { baseName });
          return baseName;
        }
        if (st.isDirectory()) {
          const masterInDir = join(masterAtRoot, `${baseName}.sc`);
          if (await fileExists(masterInDir)) {
            const tmpFile = join(uploadDir, `${baseName}.sc.tmp`);
            await copyFile(masterInDir, tmpFile);
            await rm(masterAtRoot, { recursive: true });
            await rename(tmpFile, masterAtRoot);
            console.log('[upload] HSF: .sc path was directory; replaced with inner master', { baseName });
            return baseName;
          }
          // 첫 시도가 디렉터리 bnc.sc/ 만 생성하고 내부 마스터 없음 → shattered 진행 전에 제거(중복 디렉터리 방지)
          await rm(masterAtRoot, { recursive: true }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    const xmlPath = join(uploadDir, `${baseName}.xml`);
    const partsDirCandidates = [
      join(uploadDir, baseName),
      join(uploadDir, `${baseName}_shattered`),
    ];
    let partsDir = join(uploadDir, baseName);
    await mkdir(partsDir, { recursive: true });

    const step1 = await this.runConverterWithArgs([
      '--input', inputPath,
      '--prepare_shattered_parts', partsDir,
      '--prepare_shattered_xml', xmlPath,
      '--license', CONVERTER_LICENSE,
    ]);
    if (!step1.success) {
      console.error('[upload] HSF shattered step1 failed', { exitCode: step1.exitCode, stderr: step1.stderr?.slice(0, 1500) });
      throw this.buildConverterError(step1);
    }
    for (const dir of partsDirCandidates) {
      try {
        const contents = await readdir(dir);
        if (contents.length > 0) {
          partsDir = dir;
          console.log('[upload] HSF step1 parts at', { partsDir, contents: contents.slice(0, 15) });
          break;
        }
      } catch {
        // skip
      }
    }
    const hasXml = await fileExists(xmlPath);
    if (!hasXml) {
      const fallback = await this.runConverterWithArgs([
        '--input', inputPath,
        '--output_sc', partsDir,
        '--license', CONVERTER_LICENSE,
      ]);
      if (fallback.success) {
        console.log('[upload] HSF: prepare_shattered produced no XML; ran --output_sc fallback. Master .sc not created. Viewer may show blank.', { partsDir });
        return baseName;
      }
      throw new Error('HSF 변환 1단계에서 XML이 생성되지 않았습니다. 해당 HSF는 shattered 마스터 생성을 지원하지 않을 수 있습니다.');
    }
    const masterOutputPath = join(partsDir, `${baseName}_master`);
    const step2 = await this.runConverterWithArgs([
      '--input_xml_shattered', xmlPath,
      '--sc_shattered_parts_directory', partsDir,
      '--output_sc_master', masterOutputPath,
      '--license', CONVERTER_LICENSE,
    ]);
    if (!step2.success) {
      console.error('[upload] HSF shattered step2 (master) failed', { exitCode: step2.exitCode, stderr: step2.stderr?.slice(0, 1500) });
      throw this.buildConverterError(step2);
    }
    const masterScPath = `${masterOutputPath}.sc`;
    if (await fileExists(masterScPath)) {
      await copyFile(masterScPath, masterAtRoot);
      console.log('[upload] HSF shattered workflow done', { baseName, masterAtRoot, partsDir });
    } else {
      console.log('[upload] HSF shattered workflow done (master at)', { baseName, masterScPath, partsDir });
    }
    return baseName;
  }

  private buildConverterError(result: { exitCode: number | null; spawnError?: string; stdout: string; stderr: string }): Error {
    const stderrTrim = result.stderr?.trim() ?? '';
    const isLicenseError = /license|License|does not support|Unable to initialize/i.test(stderrTrim);
    if (result.spawnError) return new Error(`Converter 실행 불가: ${result.spawnError}. (CONVERTER_BIN 확인)`);
    if (isLicenseError) return new Error('라이선스가 변환을 지원하지 않습니다. SC/SCS/SCZ만 업로드해 주세요.\n[상세] ' + stderrTrim.split('\n').slice(-2).join(' ').slice(0, 180));
    if (stderrTrim) return new Error('변환 실패:\n' + stderrTrim.split('\n').slice(-3).join('\n').slice(0, 400));
    return new Error(`변환 실패 (exit code ${result.exitCode}). 서버 로그를 확인하세요.`);
  }

  private runConverterWithArgs(
    args: string[],
  ): Promise<{ success: boolean; exitCode: number | null; spawnError?: string; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      const proc = spawn(CONVERTER_BIN, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('close', (code, signal) => {
        resolve({ success: code === 0, exitCode: code ?? null, stdout, stderr });
      });
      proc.on('error', (err: NodeJS.ErrnoException) => {
        const msg = err.code === 'ENOENT' ? `Converter not found: ${CONVERTER_BIN}` : err.message;
        console.error('[upload] Converter spawn error:', msg);
        resolve({ success: false, exitCode: null, spawnError: msg, stdout, stderr });
      });
    });
  }

  private runConverter(
    inputPath: string,
    outputScPath: string,
  ): Promise<{ success: boolean; exitCode: number | null; spawnError?: string; stdout: string; stderr: string }> {
    const args = [
      '--input', inputPath,
      '--output_sc', outputScPath,
      '--license', CONVERTER_LICENSE,
    ];
    if (CONVERT_OUTPUT_SCZ) {
      args.push('--sc_create_scz', 'true');
    }
    return this.runConverterWithArgs(args);
  }


  /**
   * 변환 직후 출력 구조를 로그 (HSF 등 포맷별 차이 분석용).
   */
  private async logConversionOutputLayout(uploadDir: string, baseName: string, inputExt: string): Promise<void> {
    const fileExists = async (p: string) => access(p, constants.F_OK).then(() => true).catch(() => false);
    const masterAtRootSc = join(uploadDir, `${baseName}.sc`);
    const masterAtRootScz = join(uploadDir, `${baseName}.scz`);
    const subDir = join(uploadDir, baseName);
    const masterInSubSc = join(subDir, `${baseName}.sc`);
    const masterInSubScz = join(subDir, `${baseName}.scz`);
    let subDirContents: string[] = [];
    try {
      subDirContents = await readdir(subDir);
    } catch {
      // subDir 없음
    }
    console.log('[upload] conversion output layout', {
      inputExt,
      baseName,
      masterAtRootSc: await fileExists(masterAtRootSc),
      masterAtRootScz: await fileExists(masterAtRootScz),
      subDirExists: await fileExists(subDir),
      masterInSubSc: await fileExists(masterInSubSc),
      masterInSubScz: await fileExists(masterInSubScz),
      subDirContents: subDirContents.slice(0, 30),
    });
  }

  /**
   * ts3d_sc_server는 model-search-directories(예: uploads) 아래에
   * <modelname>.sc(마스터)와 <modelname>/ (bnc, texture 등 리소스)를 기대합니다.
   * Converter가 <path>/<path>.sc 만 생성한 경우, 마스터를 상위로 복사합니다.
   */
  private async ensureMasterScForStreaming(uploadDir: string, baseName: string): Promise<void> {
    const masterAtRootSc = join(uploadDir, `${baseName}.sc`);
    const masterAtRootScz = join(uploadDir, `${baseName}.scz`);
    const subDir = join(uploadDir, baseName);
    const masterInSubSc = join(subDir, `${baseName}.sc`);
    const masterInSubScz = join(subDir, `${baseName}.scz`);

    const fileExists = async (p: string) => access(p, constants.F_OK).then(() => true).catch(() => false);

    if (await fileExists(masterAtRootSc) || await fileExists(masterAtRootScz)) {
      return;
    }
    if (await fileExists(masterInSubSc)) {
      await copyFile(masterInSubSc, masterAtRootSc);
      console.log('[upload] copied master to parent for streaming', { from: masterInSubSc, to: masterAtRootSc });
      return;
    }
    if (await fileExists(masterInSubScz)) {
      await copyFile(masterInSubScz, masterAtRootScz);
      console.log('[upload] copied master to parent for streaming', { from: masterInSubScz, to: masterAtRootScz });
    }
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
