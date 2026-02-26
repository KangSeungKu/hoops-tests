import { useState, useRef } from 'react';
import { StreamingViewer } from './StreamingViewer';

/** 다이렉트 스트리밍(.sc/.scs/.scz/.xml) + HOOPS Converter 변환 포맷(ifc, hsf, dwg, step, stl, obj, fbx, gltf, glb 등) */
const ACCEPT =
  '.sc,.xml,.scs,.scz,.hsf,.prc,.obj,.stl,.u3d,.wrl,.3mf,.gltf,.glb,.fbx,.dae,.3dpdf,.pdf,.dwg,.dxf,.dgn,.model,.session,.catdrawing,.catpart,.catproduct,.3dxml,.ifc,.ifczip,.rvt,.rfa,.nwd,.sldprt,.sldasm,.par,.asm,.prt,.ipt,.iam,.jt,.stp,.step,.igs,.pts,.ptx,.xyz';

export default function App() {
  const [modelId, setModelId] = useState<string | null>(null);
  const rendererType = 'csr' as const; // CSR/SSR 선택 UI 주석 처리로 고정
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
        <h1>CADian 3D CAD 스트리밍 뷰어</h1>
        {started && (
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
                  {(uploadStatus === 'idle' || uploadStatus === 'done') && '파일 선택 (CATIA, SOLIDWORKS관련 파일 외 ifc, dwg, step 등)'}
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
              {/* CSR/SSR 렌더러 선택 구간
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
              */}
              <button
                type="button"
                onClick={() => setStarted(true)}
                disabled={!modelId}
              >
                뷰어 시작
              </button>
            </div>
            <p>
              <strong>파일을 선택</strong>한 뒤 &quot;뷰어 시작&quot;을 누르세요.
            </p>
            <div className="format-tables">
              <table>
                <caption>CATIA</caption>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>확장자</th>
                    <th>설명</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>CATIA V4</td>
                    <td>MODEL, SESSION</td>
                    <td>CATIA V4 형식의 모델/세션 파일</td>
                  </tr>
                  <tr>
                    <td>CATIA V5</td>
                    <td>CATDrawing, CATPart, CATProduct</td>
                    <td>2D 도면, 단일 파트, 조립품</td>
                  </tr>
                  <tr>
                    <td>CATIA V6</td>
                    <td>3DXML</td>
                    <td>3D XML 형식 (CATIA V6 / 3DExperience)</td>
                  </tr>
                </tbody>
              </table>
              <table>
                <caption>SOLIDWORKS</caption>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>확장자</th>
                    <th>설명</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Part 파일</td>
                    <td>.SLDPRT</td>
                    <td>단일 부품(Part) 파일</td>
                  </tr>
                  <tr>
                    <td>Assembly 파일</td>
                    <td>.SLDASM</td>
                    <td>조립체(Assembly) 파일</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <small>
              그 외 포맷(ifc, hsf, dwg, step, stl, obj, fbx, gltf 등).
            </small>
          </div>
        )}
      </main>
    </div>
  );
}
