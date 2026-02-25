import { useState, useRef } from 'react';
import { StreamingViewer } from './StreamingViewer';

const ACCEPT =
  '.sc,.xml,.scs,.scz,.dwg,.step,.stp,.iges,.igs';

export default function App() {
  const [modelId, setModelId] = useState<string | null>(null);
  const [rendererType, setRendererType] = useState<'csr' | 'ssr'>('csr');
  const [started, setStarted] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'converting' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j.message || j.error || text;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      setModelId(data.modelId ?? file.name.replace(/\.[^.]+$/, ''));
      setUploadStatus('done');
    } catch (err) {
      setUploadStatus('error');
      setUploadError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = '';
  };

  return (
    <div className="app">
      <header className="header">
        <h1>HOOPS 스트리밍 뷰어</h1>
        {!started ? (
          <div className="controls">
            <label className="upload-label">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <span className="upload-btn">
                {uploadStatus === 'uploading' && '업로드 중…'}
                {uploadStatus === 'converting' && '변환 중…'}
                {(uploadStatus === 'idle' || uploadStatus === 'done') && '파일 선택 (.sc/.scs/.scz/.dwg/.step/.iges 등)'}
                {uploadStatus === 'error' && '다시 선택'}
              </span>
            </label>
            {uploadStatus === 'done' && modelId && (
              <span className="upload-done">업로드됨: {modelId} → 뷰어 시작 클릭</span>
            )}
            {uploadStatus === 'error' && uploadError && (
              <span className="upload-error-block" role="alert" title={uploadError}>
                {uploadError}
              </span>
            )}
            <label>
              렌더러
              <select
                value={rendererType}
                onChange={(e) => setRendererType(e.target.value as 'csr' | 'ssr')}
              >
                <option value="csr">CSR (Client-Side)</option>
                <option value="ssr">SSR (Server-Side)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setStarted(true)}
              disabled={!modelId}
            >
              뷰어 시작
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setStarted(false)}>
            세션 종료
          </button>
        )}
      </header>
      <main className="main">
        {started && modelId ? (
          <StreamingViewer modelId={modelId} rendererType={rendererType} />
        ) : (
          <div className="placeholder">
            <strong>파일을 선택</strong>한 뒤 &quot;뷰어 시작&quot;을 누르세요.
            <br />
            <small>
              .sc / .scs / .scz / .xml: 다이렉트 스트리밍. .dwg / .step / .iges: 변환 후 스트리밍.
            </small>
          </div>
        )}
      </main>
    </div>
  );
}
