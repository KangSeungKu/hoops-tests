# 서버 배포 절차 (Linux, HOOPS 루트가 /web/hoops 인 경우)

Docker·Docker Compose가 설치되어 있고, HOOPS 패키지가 `/web/hoops`에 있다고 가정합니다.

---

## 1. streaming-viewer-prototype 위치

프로젝트가 **HOOPS 루트 아래**에 있어야 합니다.

```text
/web/hoops/                    ← HOOPS 루트 (이미 있음)
├── server/
├── web_viewer/
├── quick_start/
├── authoring/
└── streaming-viewer-prototype/   ← 여기에 프로젝트 전체
    ├── docker-compose.yml
    ├── Dockerfile.hoops
    ├── Dockerfile.app
    ├── hoops-docker-config.js
    ├── frontend/
    ├── backend/
    └── uploads/
```

**방법 A: Git으로 배포**

```bash
cd /web/hoops
git clone <저장소 URL> streaming-viewer-prototype
# 또는 이미 있다면: cd streaming-viewer-prototype && git pull
```

**방법 B: PC에서 폴더 복사**

PC의 `streaming-viewer-prototype` 폴더 전체를 서버의 `/web/hoops/streaming-viewer-prototype` 으로 scp/rsync 등으로 복사합니다.

---

## 2. .env 파일 생성

```bash
cd /web/hoops/streaming-viewer-prototype
```

아래 내용으로 `.env` 파일을 만듭니다.

```env
# HOOPS 패키지 루트 (서버 경로)
HOOPSS_PACKAGE_PATH=/web/hoops

# (선택) 스트리밍·변환용 라이선스
# HOOPSS_LICENSE=your_license_key
```

필요하면 `HOOPSS_LICENSE` 줄의 주석을 해제하고 키를 넣습니다.

---

## 3. uploads 디렉터리

비어 있어도 됩니다. 없으면 만들어 둡니다.

```bash
mkdir -p /web/hoops/streaming-viewer-prototype/uploads
```

Docker 볼륨 마운트 시 없으면 자동으로 만들어질 수도 있습니다.

---

## 4. 이미지 빌드 및 실행

```bash
cd /web/hoops/streaming-viewer-prototype
docker compose up -d --build
```

첫 빌드는 시간이 걸릴 수 있습니다. 끝나면 다음 서비스가 떠 있습니다.

- **app**: 포트 3010 (웹 UI + API)
- **hoops-spawn**: 11182, 11180, 11000~11031

---

## 5. 접속 확인

- 서버 본인에서: `http://localhost:3010`
- 다른 PC에서: `http://<서버IP>:3010`

다른 PC에서 접속할 때 **WebSocket**이 서버 IP로 연결되어야 하므로, 프론트엔드가 사용하는 호스트가 `localhost`가 아니어야 합니다.  
현재 설정은 `HOOPSS_WS_HOST=localhost`이므로, 외부에서 접속하면 뷰어 연결이 실패할 수 있습니다. **외부 접속**을 쓸 경우 아래를 적용하세요.

---

## 6. (선택) 외부에서 접속할 때

다른 PC/브라우저에서 `http://서버IP:3010`으로 접속한다면, WebSocket이 **서버 IP**로 연결되도록 해야 합니다.

**방법: .env에 호스트 추가**

```env
HOOPSS_PACKAGE_PATH=/web/hoops
HOOPSS_WS_HOST=서버의_공인IP_또는_도메인
```

저장 후 재기동:

```bash
docker compose down
docker compose up -d
```

그리고 방화벽에서 **3010, 11182, 11180, 11000~11031** 포트가 열려 있는지 확인합니다.

---

## 7. (선택) HTTPS + WSS 사용 시

페이지를 **HTTPS**(`https://hoops.cadian.com`)로 서비스하면, 브라우저는 **비보안 WebSocket**(`ws://`) 연결을 차단합니다. **WSS**(`wss://`)로 통일해야 합니다.

**1) .env에 WSS 관련 추가**

```env
HOOPSS_PACKAGE_PATH=/web/hoops
HOOPSS_WS_HOST=hoops.cadian.com
HOOPSS_WS_SECURE=1
# HOOPSS_WS_PATH_PREFIX=/streaming   # 기본값이므로 생략 가능
```

- `HOOPSS_WS_SECURE=1`: 백엔드가 WebSocket URL을 `wss://호스트/streaming/<port>` 형태로 반환합니다.
- nginx 443에서 `/streaming/<port>`를 127.0.0.1:`<port>`로 프록시하면, 별도 SSL 리스닝 없이 WSS가 동작합니다.

**2) nginx 설정**

- `nginx/hoops.cadian.com.conf`에서 **HTTPS용 server 블록**을 활성화하고, 인증서 경로를 실제 경로로 수정합니다.
- 같은 파일에 **주석 처리된 WSS용 location**(`location ~ ^/streaming/(11000|...|11031)$`)이 있으므로, HTTPS server 블록과 함께 **주석 해제**합니다.
- 적용 후: `sudo nginx -t && sudo systemctl reload nginx`

이후 `https://hoops.cadian.com`으로 접속하면 WebSocket이 `wss://hoops.cadian.com/streaming/11000` 등으로 연결됩니다.  
방화벽에서는 **80, 443**만 열어두고, 11000~11031은 nginx가 로컬에서만 사용하므로 외부에 노출할 필요 없습니다.

---

## 8. 로그·재시작

```bash
cd /web/hoops/streaming-viewer-prototype

# 로그 보기
docker compose logs -f

# 재시작
docker compose restart

# 중지
docker compose down
```

---

## 요약 명령어 (처음 한 번)

```bash
cd /web/hoops
# (여기서 git clone 또는 폴더 복사로 streaming-viewer-prototype 생성)

cd /web/hoops/streaming-viewer-prototype
echo 'HOOPSS_PACKAGE_PATH=/web/hoops' > .env
mkdir -p uploads
docker compose up -d --build
```

이후 브라우저에서 `http://서버IP:3010` (또는 localhost:3010)으로 접속해 동작을 확인하면 됩니다.
