# 변환은 되는데 뷰어에 모델이 안 보일 때 (HSF 등 → SC/SCZ)

## 공식 답변 요약 (response_01, response_02, response_04 기준)

### SC 디렉터리 (기본)

- **`--output_sc <path>`** 예: `/app/uploads/turbine` → Converter는 **디렉터리** `/app/uploads/turbine/` 생성 (그 안에 `bnc/`, `texture/`, 마스터는 **디렉터리 안** `<name>.sc`).
- **마스터를 부모로 옮기는 CLI 옵션은 없음.** 반드시 **사후 복사** 필요.
- **ts3d_sc_server** 기대 구조:
  - `--model-search-directories`: 부모 경로 (예: `/app/uploads`)
  - `--model-file`: **확장자·경로 없이** 모델 이름만 (예: `turbine`)
  - 서버는 `uploads/turbine.sc` + `uploads/turbine/`(리소스)를 찾음. **`--model-file`에 하위 경로(예: turbine/turbine) 사용 불가.**

### 단일 파일이 필요할 때 — SCZ 사용 (response_04)

- **`--output_sc <path>.sc`** 처럼 경로에 `.sc`를 붙여도 Converter는 **단일 .sc 파일을 만들지 않음**. 항상 **디렉터리** `<name>.sc/`가 생성되는 것이 정상 동작이다. SC 포맷은 본질적으로 다중 파일/디렉터리 구조이다.
- **단일 파일**로 스트리밍하려면 **SCZ**를 쓸 것:
  - **`--output_sc /path/model`** (확장자 없음) + **`--sc_create_scz true`** → **단일 파일** `/path/model.scz` 생성.
  - 압축 없이 쓰려면 **`--sc_compress_scz false`** 추가.
- 예: `converter --input model.ifc --output_sc /path/model --sc_create_scz true --license <key>` → `/path/model.scz`
- ts3d_sc_server와 HOOPS Web Viewer는 **.sc 디렉터리** 또는 **.scz 파일** 모두 입력으로 사용 가능.

### SCZ (CONVERT_OUTPUT_SCZ=1)

- **`--sc_create_scz`** 사용 시 출력은 **단일 `<name>.scz` 파일** 하나. bnc/texture 디렉터리 없음.
- 서버는 해당 .scz 파일만 읽으면 됨.

## 우리 쪽 적용 사항

- **UploadService**
  - **HSF (.hsf)**  
    1) **CONVERT_OUTPUT_SCZ=1** 이면 **먼저** `--output_sc <uploads>/<baseName>` + `--sc_create_scz true` 한 번만 실행 → **`<baseName>.scz` 단일 파일만 생성** (디렉터리 `bnc/`, `bnc.sc/` 없음).  
    2) SCZ 미사용 시: **루트 마스터 시도** `--output_sc <baseName>.sc` → 디렉터리 `<baseName>.sc/` 생성. 내부에 마스터가 있으면 루트로 복사 후 종료. **없으면** `<baseName>.sc/` 디렉터리는 삭제 후 다음 단계로(중복 디렉터리 방지).  
    3) **2단계 shattered** 시도 → XML 없으면 `--output_sc <baseName>` 폴백으로 `uploads/<baseName>/` 만 남김. modelId 반환 (뷰어는 빈 화면일 수 있음).
  - **그 외 포맷 (CATPart, IFC 등)**  
    변환 후 `ensureMasterScForStreaming()`으로 마스터 복사. **마스터가 여전히 없으면** (shattered만 나오는 확장자만) `--output_sc <path>.sc` 폴백 후 디렉터리 내부 마스터 복사 또는 **SCZ 재시도**로 단일 .scz 확보.
  - **단일 파일이 필요할 때**: `CONVERT_OUTPUT_SCZ=1` 이면 IFC/HSF 등 **모든 변환**에서 `--sc_create_scz true` 사용 → 단일 `<name>.scz` 생성 (response_04).
- **modelDirs / model-file**: `uploads`를 modelDirs에 포함, `--model-file`에는 base name만 전달.

---

## HSF 업로드 시 `uploads/bnc/` 와 `uploads/bnc.sc/` 가 둘 다 생기는 경우

- **원인**  
  - HSF는 **convertHsfShattered** 전용 경로**만** 타서, 예전에는 `CONVERT_OUTPUT_SCZ`가 적용되지 않았음.  
  - 첫 시도: `--output_sc uploads/bnc.sc` → Converter가 **디렉터리** `uploads/bnc.sc/` 생성.  
  - HSF는 보통 그 안에 마스터 .sc가 없어서, shattered 2단계로 진행 → `--prepare_shattered_parts uploads/bnc` 및 폴백 `--output_sc uploads/bnc` 로 **`uploads/bnc/`** 생성.  
  - 그래서 **`bnc.sc/`**(첫 시도 잔여)와 **`bnc/`**(실제 사용) 두 디렉터리가 남았음.

- **필요 여부**  
  - **`bnc.sc/`** 는 첫 시도에서 마스터를 못 쓸 때의 **잔여물**이라 **필요 없음**. 스트리밍은 `bnc/` 또는 루트의 `bnc.sc`/`bnc.scz`로 함.  
  - **`bnc/`** 만 있어도 HSF는 마스터가 없으면 뷰어가 검은 화면일 수 있음. **단일 파일**이 필요하면 **CONVERT_OUTPUT_SCZ=1** 로 두면 **`bnc.scz` 하나만** 생성됨.

- **적용한 수정**  
  1. **CONVERT_OUTPUT_SCZ=1** 이면 HSF도 **맨 처음**에 `--sc_create_scz true` 로 한 번만 변환 → **`bnc.scz`만 생성** (디렉터리 없음).  
  2. Converter가 **`uploads/<name>/<name>.scz`** 로 낸 경우 루트로 복사 후 해당 디렉터리 삭제.  
  3. SCZ 미사용 시, 첫 시도에서 `bnc.sc/` 디렉터리만 생기고 내부 마스터가 없으면 **shattered 진행 전에 `bnc.sc/` 삭제** → 최종적으로 **`bnc/` 하나만** 남음.

- **CONVERT_OUTPUT_SCZ=1 인데도 .scz가 안 나올 때**  
  - **앱 이미지 재빌드** 후 재시작했는지 확인: `docker compose build app && docker compose up -d`  
  - 앱 로그에서 `[upload] HSF SCZ attempt` 가 보이면 SCZ 경로 진입함. `HSF SCZ conversion failed` 가 있으면 Converter 실패(exitCode, stderr 확인).  
  - **`HSF SCZ attempt` 다음에 `prepare_shattered produced no XML` 만 보이고 `HSF SCZ conversion failed` 가 없으면**: Converter가 **exit 0으로 성공**했지만 **.scz 파일을 만들지 않은 경우**이다. HSF 입력 시 `--sc_create_scz` 가 지원되지 않거나 무시되어, SC 디렉터리만 생성된 것으로 추정됨. 이 경우 현재는 SC/shattered 폴백으로만 진행 가능하며, 단일 .scz는 해당 HSF에서 기대하기 어려움.
  - `.env` 와 `docker-compose.yml` 의 `CONVERT_OUTPUT_SCZ` 전달 여부 확인.

---

## 동작 정리 (디렉터리 vs 단일 파일, IFC 업로드 지연)

- **`--output_sc <path>.sc`** 시 Converter가 **단일 파일**이 아니라 **디렉터리** `<path>.sc/`를 만드는 것은 **정상 동작**이다 (response_04: SC는 다중 파일 포맷이며 단일 .sc 파일 옵션 없음). 이때 디렉터리 안에 `<baseName>.sc`가 있으면 그걸 루트로 복사해 스트리밍 가능하게 하고, 없으면 단일 파일 성공으로 보지 않고 기존 shattered 플로우로 진행. **진짜 단일 파일**이 필요하면 `--sc_create_scz true`로 .scz를 생성할 것.
- **IFC 등**에서 “업로드 중”이 길게 이어지는 경우: 마스터가 없을 때 단일 파일 폴백을 돌리면서 **두 번 변환**이 되어 시간이 두 배로 걸릴 수 있음. 단일 파일 폴백은 **shattered만 나오는 확장자**(.hsf, .catpart, .catproduct 등)에만 적용하고, **.ifc 등은 제외**해 두 번 변환을 막음.

---

## 검은 화면 해결 방법 검토

| 방법 | 적용 여부 | 비고 |
|------|-----------|------|
| **단일 파일** (스트리밍용) | ✅ 적용 | response_04: 단일 .sc 파일은 지원 안 함. **SCZ** 사용: `--sc_create_scz true` → `<name>.scz` (CONVERT_OUTPUT_SCZ=1). |
| **.sc 경로 폴백** (`--output_sc <path>.sc`) | ✅ 적용 | 경로에 .sc 붙여도 디렉터리 `<path>.sc/`만 생성됨. 내부에 `<name>.sc` 있으면 루트로 복사해 사용. |
| **마스터 복사** (서브디렉터리 → 루트) | ✅ 적용 | `ensureMasterScForStreaming()`으로 `<name>/<name>.sc` → `<name>.sc` 복사. |
| **HSF shattered 2단계** (XML + output_sc_master) | ✅ 시도 | HSF는 XML이 안 나와서 2단계 불가인 경우 많음. XML 없으면 `--output_sc` 폴백 후 modelId만 반환. |
| **업로드 500 제거** (XML 없을 때 에러 대신 반환) | ✅ 적용 | HSF XML 없을 때 예외 대신 modelId 반환. |
| **챗봇 문의** (shattered 전용 옵션, HSF XML 등) | 문서화 | 위 방법으로도 해결 안 되면 `CONVERTER_VIEWER_NOT_SHOWING.md` 하단 질문으로 문의. |

---

## HSF만 검은 화면일 때

### 1. 로그로 출력 구조 비교

변환 성공 시 백엔드에서 **`[upload] conversion output layout`** 과 (필요 시) **`[upload] copied master to parent for streaming`** 이 로그에 찍힙니다.

- **HSF** 파일 업로드 후 `docker compose logs app` 또는 앱 콘솔에서 `inputExt`, `masterAtRootSc`, `subDirExists`, `masterInSubSc`, `subDirContents` 등을 확인.
- **정상 나오는 포맷**(예: IFC) 한 번 업로드한 뒤 같은 로그를 찍어 두고, HSF와 비교하면 출력 구조 차이를 볼 수 있습니다.

### 2. 로그로 확인한 HSF 변환 결과 (실제 사례)

HSF 변환 직후 로그 예:

- `inputExt: '.hsf'`, `baseName: 'bnc'` (업로드 파일명이 bnc.hsf인 경우)
- `masterAtRootSc: false`, `masterAtRootScz: false` → **마스터 .sc/.scz 없음**
- `subDirExists: true`, `masterInSubSc: false`, `masterInSubScz: false` → **서브디렉터리 안에도 마스터 없음**
- `subDirContents: [ '_digest.sci', '_meshes.sci' ]` → **디렉터리 안에는 .sci 파일만 있음**

즉, HSF 변환 시 Converter가 **`<name>.sc` 마스터 파일을 전혀 생성하지 않고**, `<name>/` 아래에 `_digest.sci`, `_meshes.sci` 등만 만드는 구조입니다. ts3d_sc_server는 마스터 .sc/.scz를 찾지 못해 모델을 로드하지 못하고 검은 화면이 됩니다.

### 3. 챗봇에 보낼 질문 (1000자 이내)

**상황 A — 로그에서 마스터가 아예 없을 때** (위와 같은 경우)  
아래를 복사해 챗봇에 보내세요.

```
When we convert an HSF file with --output_sc /app/uploads/<name>, the Converter creates only a directory /app/uploads/<name>/ containing _digest.sci and _meshes.sci. There is no <name>.sc or <name>.scz master file anywhere (not at uploads root, not inside the subdir). We need ts3d_sc_server to load the model with --model-file <name>. For other formats (IFC, DWG) the Converter produces <name>.sc inside the subdir and we copy it to the parent; for HSF there is nothing to copy. How do we get a loadable SC/SCZ from HSF conversion? Is there a different Converter option for HSF input that outputs the master .sc file, or is the HSF output meant to be loaded differently (e.g. using _digest.sci or another entry point)?
```

**상황 B — 다른 포맷은 되는데 HSF만 검은 화면일 때** (출력 구조 차이만 물어볼 때)

```
We use --output_sc <uploads>/<name> and copy <name>/<name>.sc to <name>.sc when needed. ts3d_sc_server gets --model-search-directories=<uploads> and --model-file=<name>. Other formats (IFC, DWG, STEP) display correctly; only HSF conversion results in a black screen (viewer connects, no geometry). Does the Converter produce a different output structure for HSF input (e.g. different master file name, or resources in a different path)? How should we load HSF-converted SC so the streaming viewer shows the model?
```

---

## 기타 (공통 검은 화면) — 추가로 물어볼 질문 (영문, 챗봇 복사용)

**1000자 제한용** — 아래 블록 전체를 복사해 챗봇에 붙여 넣으면 됩니다.

```
We use --output_sc /app/uploads/<name>. We copy <name>/<name>.sc to <name>.sc when the Converter only creates the subdir. The streaming viewer still shows a black screen. We set model-search-directories to uploads and --model-file to the base name.

1) The Converter often creates only uploads/<name>/ with bnc/ and texture/, no <name>.sc at uploads root. Is there a CLI option to force the master .sc at the parent level?
2) If the master is at uploads/<name>/<name>.sc, can ts3d_sc_server accept --model-file "<name>/<name>" or must the master always be at uploads/<name>.sc?
3) For SCZ (--sc_compress_models true), is the layout the same: <name>.scz at parent and <name>/ for resources?
```

---

## 참고 (response_02, response_03, response_04)

- **response_04 (단일 .sc vs SCZ)**  
  SC는 디렉터리 기반 포맷이며, `--output_sc`에 `.sc`를 붙여도 단일 파일이 아니라 디렉터리가 생성되는 것이 정상. 단일 파일이 필요하면 `--sc_create_scz true`로 .scz 사용. (압축 해제: `--sc_compress_scz false`.)

- **response_03 (HSF shattered)**  
  HSF 변환은 shattered 출력만 생성하고 마스터 .sc를 만들지 않음. 마스터를 쓰려면 `--prepare_shattered_parts`, `--prepare_shattered_xml` → `--input_xml_shattered`, `--output_sc_master` 2단계 워크플로 필요.
- Stream Cache Workflows (shattered master): `prog_guide/data_import/cad_conversion/converter_app/stream-cache-workflows.txt`
- Converter command line (shattered 옵션 포함): `api_ref/data_import/converter-command-line-options.html`
- Stream Cache Server CLI: `prog_guide/servers/stream_cache_server/command-line-options.html`

---

## 챗봇 문의가 도움되는 경우

- **`--output_sc <path>.sc`** 로 주었는데 항상 **디렉터리**만 생성되고 **단일 .sc 파일**이 안 나올 때 → **답변 반영 (response_04)**: 단일 .sc는 지원하지 않음. 단일 파일이 필요하면 **`--output_sc /path/model` + `--sc_create_scz true`** 로 **.scz** 생성. (참고: `prog_guide/viewing/data_model/stream_cache/overview.html`, `api_ref/data_import/converter-command-line-options.html`)
- **HSF에서 prepare_shattered_xml이 생성되지 않아** 2단계 마스터 생성이 불가할 때: “For HSF input, --prepare_shattered_parts and --prepare_shattered_xml produce no XML file. How can we get a loadable master SC for HSF?”
- **다른 HSF 파일**은 여전히 검은 화면이고, bnc.hsf만 나오는 경우: 포맷/옵션 차이일 수 있으므로, “Only one of our HSF files displays; others show black screen. Does Converter output differ by HSF content (e.g. single vs assembly)?” 등으로 문의하면 됨.
