import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

const HOOPSS_SPAWN_URL = process.env.HOOPSS_SPAWN_URL || 'http://localhost:11182';
const FILE_SERVER_URL = process.env.HOOPSS_FILE_SERVER_URL || HOOPSS_SPAWN_URL.replace('11182', '11180');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true });

  // /web_viewer 는 반드시 정적 서빙보다 먼저 프록시 (뷰어 스크립트 로드 실패 방지)
  // HOOPS 파일 서버는 express.static(web_viewer) 를 루트(/)에 두므로, 파일은 /hoops-web-viewer-monolith.iife.js 로 제공됨.
  // 프록시로 전달되는 path에서 /web_viewer 접두사 제거 후 대상 서버로 전달.
  app.use(
    '/web_viewer',
    createProxyMiddleware({
      target: FILE_SERVER_URL,
      changeOrigin: true,
      pathRewrite: { '^/web_viewer/?': '/' },
      onProxyReq: (proxyReq, req) => {
        const path = (req as any).url;
        const rewritten = path?.replace(/^\/web_viewer/, '') || path;
        console.log('[web_viewer proxy] request:', req.method, path, '->', FILE_SERVER_URL + rewritten);
      },
      onProxyRes: (proxyRes) => {
        const status = proxyRes.statusCode;
        if (status !== 200) {
          console.warn('[web_viewer proxy] upstream response:', status, proxyRes.statusMessage);
        }
      },
      onError: (err, req, res) => {
        const path = (req as any).url;
        console.error('[web_viewer proxy] error:', err?.message || err, 'path=', path, 'target=', FILE_SERVER_URL);
        (res as any).writeHead(502, { 'Content-Type': 'text/plain' });
        (res as any).end('Bad Gateway: could not reach viewer assets');
      },
    }),
  );

  // React 빌드 정적 서빙 (프록시 다음에 등록). 루트(/) 요청 시 index.html 제공
  app.use(express.static(join(__dirname, '..', 'public'), { index: 'index.html' }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Streaming Viewer API listening on port ${port}`);
  console.log('[web_viewer proxy] target FILE_SERVER_URL =', FILE_SERVER_URL);
}
bootstrap();
