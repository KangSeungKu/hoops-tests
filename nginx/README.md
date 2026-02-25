# Nginx 설정 (hoops.cadian.com)

## 적용 방법

1. 이 디렉터리의 `hoops.cadian.com.conf`를 nginx 사이트 설정 경로에 복사(또는 심볼릭 링크)합니다.

   ```bash
   # Ubuntu/Debian
   sudo cp hoops.cadian.com.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/hoops.cadian.com.conf /etc/nginx/sites-enabled/

   # 또는 conf.d 사용 시
   sudo cp hoops.cadian.com.conf /etc/nginx/conf.d/
   ```

2. 설정 검사 후 재적재합니다.

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

## .env 설정

브라우저가 WebSocket을 `hoops.cadian.com`으로 연결하도록 `streaming-viewer-prototype/.env`에 다음을 설정합니다.

```env
HOOPSS_WS_HOST=hoops.cadian.com
```

## 포트

- **80 (및 선택 443)**  
  nginx가 `hoops.cadian.com`으로 받아서 앱(3010)으로 프록시합니다.
- **11000~11031**  
  Docker가 호스트에 그대로 노출합니다. 브라우저는 `ws://hoops.cadian.com:11000` 등으로 접속하므로, 방화벽에서 11000~11031 포트를 열어두어야 합니다.

## HTTPS

Let’s Encrypt 등으로 인증서를 발급한 뒤, `hoops.cadian.com.conf` 안의 HTTPS용 `server { ... }` 블록 주석을 해제하고 `ssl_certificate` / `ssl_certificate_key` 경로를 수정한 다음 `nginx -t && systemctl reload nginx` 하면 됩니다.
