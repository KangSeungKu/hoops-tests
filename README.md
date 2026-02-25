# HOOPS 스트리밍 뷰어 프로토타입

Windows Docker Desktop에서 동작하는 스트리밍 뷰어 프로토타입입니다.

## 구성

- **hoops-spawn**: HOOPS Spawn Server. 빌드 시 상위 디렉터리(HOOPS 패키지 루트)의 `server`, `web_viewer`, **`quick_start`**(샘플 모델)를 이미지에 복사하여 사용합니다. **SC(Stream Cache) 모델**을 사용하며, `uploads` 볼륨으로 업로드된 파일은 컨버팅 없이 다이렉트 스트리밍됩니다.
- **app**: Nest.js API (`POST /api/spawn`, `POST /api/upload`) + React 정적 서버, `/web_viewer` 프록시

## 사전 요구사항

- Docker Desktop (Windows)
- **이 프로젝트가 HOOPS 패키지 루트의 `streaming-viewer-prototype` 폴더 안에 있어야 합니다.**  
  (상위에 `server/`, `web_viewer/`가 있어야 빌드 시 복사 가능)
- **`.env`에 `HOOPSS_PACKAGE_PATH`를 HOOPS 패키지 루트 절대 경로로 설정하세요.**  
  빌드 컨텍스트로 사용되며, Windows에서는 슬래시(`/`) 형식 권장. 예: `HOOPSS_PACKAGE_PATH=D:/project/HOOPS/HOOPS_Visualize_Web_2026.1.0`
- (선택) `.env`에 `HOOPSS_LICENSE` 설정. 없으면 기존 `server/node/Config.js`의 license 사용

## 실행

```bash
# 반드시 streaming-viewer-prototype 디렉터리에서 실행
cd D:\project\HOOPS\HOOPS_Visualize_Web_2026.1.0\streaming-viewer-prototype

# .env에 HOOPSS_PACKAGE_PATH 가 설정되어 있는지 확인 후
docker compose down
docker compose up --build
```

**처음 한 번은** 캐시 없이 hoops-spawn만 다시 빌드하면 좋습니다(이전에 잘못 빌드된 이미지 제거):

```bash
docker compose build --no-cache hoops-spawn
docker compose up --build
```

브라우저에서 **http://localhost:3000** 접속 후, **파일을 선택**(.sc/.scs/.scz/.dwg/.step/.iges 등)한 뒤 "뷰어 시작" 클릭. (모델 이름 입력란은 제거되어 있으며, 파일 업로드만 사용합니다.)

## 서버 배포 시 필요한 것

**docker-compose 파일만으로는 부족합니다.** 서버에 다음이 모두 있어야 합니다.

| 항목 | 설명 |
|------|------|
| **Docker + Docker Compose** | 서버에 Docker Engine과 Compose V2 설치 |
| **프로젝트 전체** | `streaming-viewer-prototype` 폴더 전체(또는 그 안의 docker-compose.yml, Dockerfile들, hoops-docker-config.js, frontend/, backend/, uploads/ 등). **빌드**를 서버에서 한다면 **HOOPS 패키지 루트**도 필요(상위에 server/, web_viewer/, quick_start/, authoring/converter 등). |
| **.env** | `HOOPSS_PACKAGE_PATH`(서버에서의 HOOPS 루트 절대 경로). (선택) `HOOPSS_LICENSE` |
| **uploads 디렉터리** | 비어 있어도 되며, 볼륨 마운트용으로 존재해야 함 |

**배포 방식 두 가지**

1. **서버에서 빌드**  
   서버에 HOOPS 패키지 루트를 올리고, 그 안에 `streaming-viewer-prototype`을 둔 뒤, 해당 폴더에서 `docker compose up --build` 실행. `.env`에 `HOOPSS_PACKAGE_PATH`를 서버 경로로 설정.

2. **이미지만 배포**  
   PC에서 `docker compose build`로 이미지를 만든 뒤, 이미지를 레지스트리(또는 서버로 export)로 옮기고, 서버의 docker-compose에서는 `build:` 대신 `image:` 로 그 이미지를 쓰도록 수정. 이 경우 서버에는 HOOPS 소스 없이 docker-compose.yml, .env, uploads 폴더만 있으면 됨.

서버가 **Linux**이면 `HOOPSS_PACKAGE_PATH`는 Linux 경로(예: `/opt/hoops/HOOPS_Visualize_Web_2026.1.0`)로 설정하세요.

## SC/SCS/SCZ 및 파일 업로드

- **다이렉트 스트리밍:** `.sc`, `.xml`, **`.scs`**, **`.scz`** — 컨버팅 없이 `uploads` 볼륨에 저장 후 바로 스트리밍됩니다. Config의 `modelDirs`/`fileServerStaticDirs`에 `uploads`가 포함되어 있습니다.
- **변환 후 스트리밍:** **`.dwg`**, **`.step`**, **`.stp`**, **`.iges`**, **`.igs`** — HOOPS Converter로 SC 형식으로 변환한 뒤 `uploads`에 저장·스트리밍합니다. 변환을 위해 **`.env`에 `HOOPSS_LICENSE`** 설정이 필요하며, 앱 이미지는 상위(HOOPS 루트) 컨텍스트에서 빌드해 `authoring/converter/bin/linux64`가 포함됩니다.
- **볼륨:** 호스트 `streaming-viewer-prototype/uploads` → app `/app/uploads`, hoops-spawn `/app/hoops/uploads`. 업로드 후 반환된 `modelId`로 "뷰어 시작"을 누르면 됩니다.

## 문제 해결: `spawn .../ts3d_sc_server ENOENT` / 503

**현재 구성:** `ts3d_sc_server`는 **이미지 빌드 시** `HOOPSS_PACKAGE_PATH`(또는 상대 경로 `../`)를 **빌드 컨텍스트**로 사용해 복사됩니다.

1. **`.env`에 `HOOPSS_PACKAGE_PATH` 설정**  
   HOOPS 패키지 루트의 **절대 경로**를 넣습니다. Windows에서는 슬래시 사용 권장.

   ```env
   HOOPSS_PACKAGE_PATH=D:/project/HOOPS/HOOPS_Visualize_Web_2026.1.0
   ```

2. **캐시 없이 hoops-spawn만 재빌드**  
   예전에 잘못된 컨텍스트로 빌드된 이미지를 쓰고 있을 수 있으므로, 한 번은 `--no-cache`로 빌드합니다.

   ```bash
   docker compose down
   docker compose build --no-cache hoops-spawn
   docker compose up --build
   ```

   빌드 중에 `ERROR: ts3d_sc_server not in build context` 가 나오면, `HOOPSS_PACKAGE_PATH`가 `server` 폴더를 포함한 HOOPS 루트를 가리키는지 확인하세요.

3. **컨테이너 내부 확인** (PowerShell/CMD에서 실행. Git Bash는 사용하지 마세요.)

   ```powershell
   docker compose exec hoops-spawn sh -c "ls -la /app/hoops/server/bin/linux64/"
   ```

   `ts3d_sc_server`가 보이면 정상입니다.

**참고:** 파일이 있는데도 spawn 시 ENOENT가 난다면, **Alpine(musl)과 glibc 호환 문제**일 수 있습니다. `ts3d_sc_server`는 glibc 기반 Linux용이라, hoops-spawn 이미지는 **Debian(glibc) 기반**(`node:22-bookworm-slim`)을 사용하도록 되어 있습니다. 이전에 Alpine 이미지로 빌드했다면 `docker compose build --no-cache hoops-spawn` 후 다시 올리세요.

## 문제 해결: "연결됨"인데 화면이 비어 있음

WebSocket은 연결되었지만 **3D 모델이 보이지 않는** 경우, 컨테이너 안에 **모델 파일이 없어서**입니다. `Config.js`의 모델 검색 경로(`quick_start/converted_models/...`)에 해당 폴더가 이미지에 포함되어 있어야 합니다.

**해결:** `Dockerfile.hoops`에서 `quick_start`를 이미지에 복사하도록 되어 있습니다. **hoops-spawn을 다시 빌드**하면 샘플 모델(moto 등)이 포함됩니다.

```bash
docker compose down
docker compose build --no-cache hoops-spawn
docker compose up --build
```

이미지를 다시 빌드한 뒤, **파일을 업로드**하고 "뷰어 시작"을 누르면 모델이 표시되어야 합니다. 여전히 비어 있으면 브라우저 개발자 도구(F12) 콘솔에서 WebViewer/스트리밍 관련 오류가 있는지 확인하세요.

## 문제 해결: "Failed to load WebViewer script"

뷰어 스크립트를 불러오지 못할 때는 앱(app) 컨테이너의 `/web_viewer` 프록시가 HOOPS 파일 서버(11180)에 **잘못된 경로**로 요청하거나 연결되지 않는 경우가 많습니다.

**원인:** Express에서 `app.use('/web_viewer', proxy)`로 마운트하면, 프록시에는 경로가 `/web_viewer` 없이(예: `/hoops-web-viewer-monolith.iife.js`)만 전달됩니다. 이대로 프록시하면 대상 서버에서 404가 나므로, `pathRewrite`로 `/web_viewer/`를 다시 붙이도록 되어 있습니다.

**해결 방법:**

1. **앱 이미지 다시 빌드**  
   백엔드에서 `/web_viewer` 프록시를 정적 서빙보다 먼저 등록하도록 수정했으므로, 앱을 다시 빌드합니다.

   ```bash
   docker compose down
   docker compose up --build
   ```

2. **파일 서버 직접 사용(폴백)**  
   위 후에도 실패하면, 프론트엔드에서 파일 서버(11180) URL을 직접 쓰도록 할 수 있습니다.  
   `frontend` 폴더에 `.env`를 만들고 다음을 넣은 뒤 **프론트엔드만 다시 빌드**합니다.

   ```env
   VITE_VIEWER_ASSETS_ORIGIN=http://localhost:11180
   ```

   그다음 `docker compose up --build`로 앱을 다시 빌드해 실행합니다. 브라우저가 `http://localhost:11180`에서 뷰어 스크립트를 직접 받습니다.

3. **Deprecation 경고**  
   터미널에 `(node:1) [DEP0060] DeprecationWarning: util._extend...` 가 나와도 동작에는 영향 없습니다. Dockerfile.app에서 `NODE_OPTIONS=--no-deprecation` 로 억제해 두었습니다.

## 로컬 개발 (Docker 없이)

1. **HOOPS Spawn 서버** (Linux 또는 WSL에서 ts3d_sc_server 사용 시):
   - 상위 HOOPS 루트에서 기존 서버 실행 (또는 Docker로 hoops-spawn만 실행)

2. **백엔드**
   ```bash
   cd backend && yarn install && yarn start
   ```

3. **프론트엔드**
   ```bash
   cd frontend && yarn install && yarn dev
   ```
   - Vite가 `/api`를 백엔드로, `/web_viewer`를 파일 서버(예: 11180)로 프록시하도록 `vite.config.ts` 설정됨.
   - 파일 서버가 11180에서 떠 있어야 뷰어 스크립트 로드 가능.

## API

- `POST /api/spawn`  
  Body: `{ "modelId": "moto", "rendererType": "csr" | "ssr" }`  
  Response: `{ "sessionId": "...", "endpointUri": "ws://...", "status": "ready" }`

- `POST /api/upload`  
  Body: `multipart/form-data`, 필드명 `file`.  
  **다이렉트 스트리밍:** `.sc`, `.xml`, `.scs`, `.scz`.  
  **변환 후 스트리밍:** `.dwg`, `.step`, `.stp`, `.iges`, `.igs` (HOOPS Converter 사용, `HOOPSS_LICENSE` 필요).  
  Response: `{ "modelId": "파일명(확장자 제외)" }`. 업로드/변환 결과는 `uploads` 볼륨에 저장되며, 해당 modelId로 spawn 시 스트리밍됨.

## 포트

| 포트    | 용도                    |
|--------|-------------------------|
| 3000   | 앱(React + Nest API)    |
| 11182  | Spawn REST API          |
| 11180  | HOOPS 파일 서버         |
| 11000~11031 | SC Server WebSocket |
