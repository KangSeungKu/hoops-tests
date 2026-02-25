/**
 * HOOPS Spawn Server - Docker 전용 설정
 * communicatorDir, publicHostname, modelDirs(업로드 폴더) 등을 컨테이너 환경에 맞게 오버라이드합니다.
 * docker-compose에서 이 파일을 /app/hoops-config.js 로 마운트합니다.
 */
const path = require('path');

const communicatorDir = process.env.HOOPSS_COMMUNICATOR_DIR || '/app/hoops';
const baseConfig = require(path.join(communicatorDir, 'server/node/Config.js'));

// 업로드 디렉터리: 볼륨으로 마운트된 경로. 여기에 넣은 SC 모델은 컨버팅 없이 다이렉트 스트리밍됨.
const uploadsDir = './uploads';

module.exports = {
  ...baseConfig,
  communicatorDir,
  publicHostname: process.env.HOOPSS_PUBLIC_HOSTNAME || 'localhost',
  license: process.env.HOOPSS_LICENSE || baseConfig.license,
  licenseFile: process.env.HOOPSS_LICENSE_FILE || baseConfig.licenseFile,
  disableConsoleEnterToShutdown: true,
  // 업로드 폴더를 모델 검색 경로에 추가 (기존 quick_start 등과 동일하게 스트리밍)
  modelDirs: [...(baseConfig.modelDirs || []), uploadsDir],
  fileServerStaticDirs: [...(baseConfig.fileServerStaticDirs || []), uploadsDir],
};
