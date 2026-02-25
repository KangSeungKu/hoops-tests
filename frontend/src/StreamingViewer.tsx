import { useState, useRef, useEffect } from 'react';

// 동일 오리진 프록시 실패 시 .env에 VITE_VIEWER_ASSETS_ORIGIN=http://localhost:11180 로 파일 서버 직접 사용
const VIEWER_ASSETS_ORIGIN = import.meta.env.VITE_VIEWER_ASSETS_ORIGIN || '';
const VIEWER_SCRIPT = VIEWER_ASSETS_ORIGIN
  ? `${VIEWER_ASSETS_ORIGIN}/web_viewer/hoops-web-viewer-monolith.iife.js`
  : '/web_viewer/hoops-web-viewer-monolith.iife.js';

declare global {
  interface Window {
    Communicator?: {
      WebViewer: new (opts: {
        container: HTMLElement;
        endpointUri: string;
        model?: string;
        streamingMode?: number;
        rendererType?: number;
        enginePath?: string;
      }) => { start: () => void; setCallbacks: (c: Record<string, () => void>) => void };
    };
  }
}

function loadViewerScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Communicator) return Promise.resolve();
  const existing = document.querySelector(`script[src="${VIEWER_SCRIPT}"]`) || document.querySelector('script[src*="hoops-web-viewer-monolith"]');
  if (existing) {
    return window.Communicator ? Promise.resolve() : new Promise((r) => setTimeout(() => r(), 100));
  }

  console.log('[WebViewer] Loading script:', VIEWER_SCRIPT);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VIEWER_SCRIPT;
    script.crossOrigin = VIEWER_ASSETS_ORIGIN ? 'anonymous' : '';
    script.onload = () => {
      console.log('[WebViewer] Script loaded successfully:', VIEWER_SCRIPT);
      resolve();
    };
    script.onerror = (e) => {
      const msg = `Failed to load WebViewer script: ${VIEWER_SCRIPT}`;
      console.error('[WebViewer]', msg, e);
      reject(new Error(msg));
    };
    document.head.appendChild(script);
  });
}

/** 스크립트 URL이 실제로 응답하는지 확인 (진단용) */
export async function checkViewerScriptUrl(): Promise<{ ok: boolean; status: number; statusText: string; url: string }> {
  const url = VIEWER_SCRIPT;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { ok: res.ok, status: res.status, statusText: res.statusText, url };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error('[WebViewer] checkViewerScriptUrl fetch failed:', url, err);
    return { ok: false, status: 0, statusText: err, url };
  }
}

export interface StreamingViewerProps {
  modelId: string;
  rendererType: 'csr' | 'ssr';
}

export function StreamingViewer({ modelId, rendererType }: StreamingViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<unknown>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'spawning' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId || !containerRef.current) return;

    let cancelled = false;

    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const check = await checkViewerScriptUrl();
        console.log('[WebViewer] Script URL check:', check);
        if (!check.ok) {
          setError(`스크립트 URL 응답 이상: ${check.status} ${check.statusText} (${check.url})`);
          setStatus('error');
          return;
        }
        await loadViewerScript();
        if (cancelled) return;

        setStatus('spawning');
        const res = await fetch('/api/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId, rendererType }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        const data = await res.json();
        const endpointUri = data.endpointUri as string;
        if (cancelled || !containerRef.current) return;

        const Communicator = window.Communicator;
        if (!Communicator) throw new Error('Communicator not loaded');

        const RendererType = { Client: 0, Server: 1 };
        const StreamingMode = { Interactive: 0, OnDemand: 1, All: 2 };

        const hwv = new Communicator.WebViewer({
          container: containerRef.current,
          endpointUri,
          model: modelId || undefined,
          streamingMode: StreamingMode.Interactive,
          rendererType: rendererType === 'ssr' ? RendererType.Server : RendererType.Client,
        });

        hwv.setCallbacks({
          sceneReady: () => {
            if (!cancelled) setStatus('ready');
          },
          modelStructureReady: () => {},
          connectionLost: () => {
            if (!cancelled) setStatus('error');
            setError('Connection lost');
          },
        });

        hwv.start();
        viewerRef.current = hwv;
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          console.error('[WebViewer] Error:', msg, 'Script URL:', VIEWER_SCRIPT);
        }
      }
    })();

    return () => {
      cancelled = true;
      const v = viewerRef.current as { shutdown?: () => void } | null;
      if (v?.shutdown) v.shutdown();
      viewerRef.current = null;
    };
  }, [modelId, rendererType]);

  return (
    <div className="viewer-wrap">
      <div className="viewer-status">
        {status === 'idle' && '모델과 렌더러를 선택한 뒤 시작을 누르세요.'}
        {status === 'loading' && '뷰어 스크립트 로딩 중…'}
        {status === 'spawning' && '세션 생성 중…'}
        {status === 'ready' && '연결됨'}
        {status === 'error' && error && (
          <>
            <span>{error}</span>
            <br />
            <small className="viewer-status-detail">진단: 스크립트 URL = {VIEWER_SCRIPT}</small>
          </>
        )}
      </div>
      <div ref={containerRef} className="viewer-container" tabIndex={0} />
    </div>
  );
}
