# Stem DJ 제작·개선 통합 프롬프트

> 이 문서는 Stem DJ 프로젝트의 목적, 기능 계약, 디자인 규칙, 구현 순서,
> 안전 경계, 검증 방법, 인수 기준을 한 번에 전달하기 위한 재사용 프롬프트다.
> 다른 AI 또는 개발 작업자에게 전달할 때 이 문서 전체를 작업 지시로 사용한다.

## 1. 작업자 역할

당신은 로컬 오디오·Web Audio·Python 서버·접근성·브라우저 QA를 함께 다루는
시니어 제품 엔지니어다. 목표는 기존 Stem DJ Lab을 실제 DJ 작업에 쓸 수 있는
조밀하고 안정적인 2-deck 콘솔로 개선하는 것이다.

작업 원칙:

1. 먼저 현재 소스와 정본 문서를 읽고, 확인한 사실·추정·미검증 사항을 분리한다.
2. 기존 기능과 사용자 변경을 보존한다. 요청하지 않은 프레임워크 전환, 대규모 리팩터링,
   파일 정리, 설정 초기화, 삭제를 하지 않는다.
3. 구현 작업은 한 작업 단위마다 코드와 테스트를 함께 갱신하고, 실제 실행 증거를 남긴다.
4. 테스트가 통과했다는 사실만으로 브라우저 QA·오디오 QA·배포 준비 완료를 주장하지 않는다.
5. 확인하지 못한 상태는 `미검증`으로 표시하고 추정으로 `PASS`를 만들지 않는다.
6. 작업 완료 보고에는 결과, 파일 경로, 실행한 검증, 남은 위험을 포함한다.

## 2. 프로젝트 정체성

### 제품

Stem DJ Lab은 로컬 음원 라이브러리와 파일 불러오기를 지원하는 브라우저 기반
2-deck DJ 앱이다. Deck A와 Deck B에서 곡을 재생하고, 파형·BPM·cue·loop·scratch·
crossfader·EQ·FX·stem 조절·녹음을 수행한다.

이 제품은 랜딩 페이지나 음악 포트폴리오가 아니다. 어두운 책상 위의 하드웨어 DJ
콘솔처럼 낮은 눈부심, 빠른 스캔, 반복 조작, 명확한 상태 피드백을 우선한다.

### 기술 기준

- 프런트엔드: 프레임워크 없는 vanilla JavaScript, HTML, CSS
- 서버: Python 표준 라이브러리 기반 `server.py`
- 오디오: Web Audio API, `AudioContext`, `AudioParam`, `AnalyserNode`,
  `MediaRecorder`, 필요 시 AudioWorklet fallback
- 서버 테스트: Python `unittest`, `tempfile`, `http.client`, `threading` 중심
- JavaScript 테스트: Node 내장 `node:test`
- 브라우저 QA: 새 브라우저 의존성을 설치하지 않는 저장소 내 CDP harness
- 실사용 경로: 사용자가 설정한 로컬 음악 폴더
- 검증 경로: 반드시 임시 fixture 폴더

절대 React, Vite, Next, FastAPI, Flask, 새 CSS 프레임워크로 마이그레이션하지
않는다. 현재 구조가 부족하다는 이유만으로 스택을 바꾸지 않는다.

## 3. 현재 작업 공간과 정본

현재 작업 공간:

```text
D:\Ai 산출물\stem-dj
```

정본 파일:

| 파일 | 역할 |
| --- | --- |
| `README.md` | 실행법, 라이브러리, 지원 형식, 현재 기능, Demucs 동작 |
| `DESIGN.md` | 색상 토큰, 타이포그래피, 레이아웃, 컴포넌트 상태, 모션, 접근성 계약 |
| `.omo/plans/stem-dj-overhaul.md` | 전체 30개 작업과 의존성·인수·QA·최종 게이트 |
| `server.py` | 설정, 라이브러리 스캔, 미디어/stem 라우트, Demucs job lifecycle |
| `static/index.html` | 콘솔·탭·오버레이·라이브러리 DOM |
| `static/styles.css` | 콘솔 레이아웃과 디자인 토큰 구현 |
| `static/app.js` | 앱 초기화, 탭, 믹서, 전역 입력, 오디오 연결 |
| `static/deck.js` | deck transport, platter, cue/loop, stems, deck audio graph |
| `static/library.js` | Library/Browse 렌더링, 검색·필터·선택·load workflow |
| `static/audio-engine.js` | 공유 오디오 컨텍스트와 master/recording 연결 |
| `static/audio-params.js` | AudioParam·meter 관련 순수 helper |
| `static/deck-logic.js` | stem gain, loop, crossfader 등 순수 로직 |
| `static/platter-logic.js` | seek·scratch pointer 계산 순수 helper |
| `static/ui-state.js` | stem/job 상태 문구 helper |
| `tests/` | JavaScript·Python·브라우저 QA 테스트 |
| `.omo/evidence/` | 작업별 검증 증거와 스크린샷 |

현재 기록상 `.omo/plans/stem-dj-overhaul.md`의 Task 1~8은 구현 및 검증이 완료된
상태로 표시되어 있고, Task 9~30은 미완료로 표시되어 있다. Task 8의 최종 기록은
375x812, 768x1024, 1280x800 브라우저 QA와 디자인 계약 검사, 50개 JavaScript
테스트를 PASS로 기록하지만, 이는 과거 증거다. 새 작업에서 전체 완료를 선언하기
전에는 필요한 명령을 다시 실행한다.

`.git` 디렉터리는 존재하지만 현재 작업 공간에서 정상 Git 저장소로 인식되지 않을
수 있으므로, 실제 확인 없이 커밋·브랜치·Git 보호 상태를 주장하지 않는다. Git이
동작하지 않으면 변경 파일과 검증 결과를 최종 보고에 기록한다.

## 4. 제품 기능 계약

### 4.1 라이브러리와 파일

- 기본 라이브러리 경로는 사용자 설정값을 사용한다.
- 기본 지원 확장자는 `mp3`, `wav`, `flac`, `m4a`, `aac`, `ogg`다.
- `Refresh`는 폴더를 다시 스캔한다.
- 브라우저 `Add files`는 임시 로컬 파일을 추가한다.
- `Library folder path`와 `Set Library`는 앱 설정으로 저장한다.
- 설정 파일은 기존 `settings.json` 스키마와 호환되어야 한다.
- `.stems` 캐시 폴더는 일반 라이브러리 목록에서 제외한다.
- BPM 캐시는 기존 `localStorage` 키 규칙을 보존한다.
- empty library, filtered-zero, unsupported file, scan-limited 상태를 깨짐 없이
  설명한다.

### 4.2 Deck A/B

각 deck은 다음 상태와 조작을 제공한다.

- 빈 deck, 곡 로드, 재생, 일시정지, cue-ready, loading, error
- platter와 진행 위치, 현재 시간·전체 시간
- play, pause, cue, load
- tempo/pitch 조절
- scratch/vinyl mode
- hot cue 4개
- beat loop `1/2`, `1`, `4`, `8`
- overview waveform과 zoom waveform
- track title, filename, BPM, stem 상태

Deck A는 teal 계열, Deck B는 blue 계열로 식별한다. 두 색은 장식용으로 다른
컨트롤에 무분별하게 쓰지 않는다.

### 4.3 Mixer·EQ·FX

- Deck A/B channel volume
- crossfader와 equal-power 중심 동작
- master volume
- EQ `low`, `mid`, `high`
- filter
- echo, reverb, flanger, phaser, bitcrusher
- 수치가 중요한 range input에는 보이는 label과 readout을 제공한다.
- gain/filter/wet/stem 파라미터는 짧고 예측 가능한 smoothing을 사용한다.
- transport seek와 scratch grain에는 조작 지연을 만드는 smoothing을 적용하지 않는다.
- repeated load/reload에서 오디오 노드·LFO·scratch source가 중복 생성되지 않도록
  lifecycle을 정리한다.

### 4.4 Stem workflow

Demucs가 설치되어 있을 때만 stem split을 실행한다. 설치되지 않았을 때에도
일반 재생과 DJ 조작은 계속 동작하고, split 버튼은 명확한 안내를 표시한다.

기본 stem은 `vocals`, `drums`, `bass`, `other`다.

각 stem에 대해 다음을 제공한다.

- volume
- mute
- solo
- unavailable, loading, queued, running, ready, muted, soloed, error 상태
- color만이 아니라 텍스트·button state·`aria-pressed` 등으로 상태를 전달

서버는 stem 파일을 캐시하고, 기존 유효한 `/media`와 `/stem` URL 동작을 깨지
않는다. stem 경로는 허용된 stem 이름과 track root를 모두 검증하며, 경로 탈출을
허용하지 않는다.

### 4.5 녹음

- master bus를 사용자가 듣는 경로와 녹음 경로가 일치하도록 한다.
- `MediaRecorder`의 지원 불가, 빈 deck, start 없이 stop하는 경우를 제어된 상태로
  처리한다.
- record start/stop/download 상태를 알아보기 쉽게 표시한다.
- 최종 headroom·limiter/compressor를 우회하는 dry deck 신호를 녹음하지 않는다.

## 5. 디자인·UX 계약

`DESIGN.md`가 세부 규칙의 최종 정본이다. UI를 변경하기 전에 그 파일을 읽고,
새 토큰이나 계약을 추가해야 하면 먼저 `DESIGN.md`를 갱신한다.

### 5.1 분위기

- dense performance console
- 저명도 dark desk/hardware 질감
- inset panel, tight border, compact row
- 빠른 조작과 정보 스캔 우선
- hero, marketing card, decorative orb, bokeh, generic gradient 금지

### 5.2 핵심 색상 토큰

새 UI 색상은 반드시 이름 있는 토큰으로 추가한다. 새 코드에서 임의 raw hex/rgba를
직접 사용하지 않는다.

```text
surface-app       #080a0d
surface-topbar    #0b0e13
surface-panel     #11151b
surface-raised    #171c24
surface-strong    #202633
surface-inset     #080b10
surface-grid      #121823
border-default    #2b3442
border-subtle     #1f2835
text-primary      #f3f6fb
text-muted        #8d98a8
text-disabled     #596270
accent-deck-a     #31c4a8
accent-deck-a-strong #64e5cf
accent-deck-b     #55b8ff
accent-deck-b-strong #8bd3ff
accent-control    #c780ff
accent-warm       #ff9a4d
cue-red           #ff6969
cue-yellow       #f0d327
cue-green         #43d34c
meter-safe        #31c4a8
meter-warn        #e0bc5b
meter-hot         #ff5757
state-danger      #ff5757
focus-ring        #f4c8ff
```

Purple는 전역 control accent로만 사용하고, 모든 active state를 purple/blue로
칠하지 않는다. meter는 safe/warn/hot semantic token을 사용한다.

### 5.3 레이아웃

- 4px spacing scale을 기준으로 한다.
- performance view는 하나의 악기처럼 구성하며, topbar·global waveform·deck/mixer·
  stem utility·zoom·library/status zone을 가진다.
- `min-height: 100dvh`와 안정된 grid track을 사용한다.
- 데스크톱 `1280px`, `1365px`, `1440px`에서 두 deck, mixer, waveform, stems, zoom,
  library가 겹치지 않아야 한다.
- `768x1024`, `375x812`에서는 stacked layout과 내부 스크롤을 사용하며 핵심 DJ
  컨트롤을 숨겨서 맞추지 않는다.
- 페이지 전체의 수평 overflow와 짧은 노트북 높이에서의 primary control clipping을
  방지한다.
- panel radius는 대체로 6px, control은 4px, overlay는 8px 이내로 유지한다.

### 5.4 타이포그래피와 상태

- UI: `Segoe UI`, `Malgun Gothic`, system-ui 계열
- 수치: `Cascadia Mono`, `Consolas` 계열과 tabular figures
- 일반 조작 글자는 12px 미만으로 내리지 않는다.
- 버튼·입력·탭·row는 default, hover, active/pressed, focus-visible, disabled,
  loading 중 해당 상태를 제공한다.
- 선택·활성·mute·solo는 색상만으로 구분하지 않는다.
- overlay는 dialog semantics, 초기 focus, focus trap, Escape close, focus restore,
  hidden 상태의 tab 제외를 지원한다.

### 5.5 모션

- micro interaction은 100~150ms, overlay는 180~240ms 정도로 제한한다.
- `transform`, `opacity`, `filter` 중심으로만 애니메이션한다.
- idle decorative animation을 추가하지 않는다.
- platter·waveform·meter는 재생·seek·loop·scratch·signal에 의해 움직일 때만
  갱신한다.
- `prefers-reduced-motion`을 존중한다.

## 6. 서버·보안·데이터 경계

다음 규칙은 테스트와 구현 모두에서 강제한다.

1. 실제 사용자 음악 폴더에 QA 서버를 연결하지 않는다. 계획상 보호 대상인
   `D:\Apple Music\Music` 및 사용자의 실제 라이브러리 경로를 테스트 중 건드리지 않는다.
2. 모든 서버·브라우저·오디오 QA는 `.omo/tmp/stem-dj-fixtures` 또는 명시한 임시
   디렉터리를 사용한다.
3. 테스트 중 실제 `settings.json`을 사용자 경로로 변경하지 않는다.
4. temp harness가 만든 파일은 해당 temp root 안에만 존재해야 한다.
5. `/stem`은 허용된 stem 이름을 먼저 확인하고, 유효한 track id와 configured stem
   root 내부인지 검증한 뒤 스트리밍한다.
6. 오류 응답에 서버의 실제 파일 시스템 경로를 노출하지 않는다.
7. timestamp만으로 Demucs job id를 만들지 않는다. 충돌 방지 가능한 표준 라이브러리
   식별자를 사용한다.
8. stale queued/running job은 소유 중인 살아 있는 프로세스를 확인하지 않고 강제
   종료하지 않는다. 정해진 만료 기준에 따라 사용자에게 알 수 있는 error 상태로
   정리한다.
9. 이 단계에서는 Demucs cancel/kill 기능을 새로 만들지 않는다.
10. dependency 설치, 브라우저 도구 설치, 실제 음원 접근, 외부 게시·업로드는 별도
    승인과 정확한 대상 확인 없이는 하지 않는다.

## 7. 구현 로드맵

각 항목은 “구현 + 테스트 + 증거”를 하나의 작업으로 처리한다. 아래 상태는 시작
시점의 기록이며, 실제 작업 전 파일과 테스트를 다시 확인한다.

### Wave 1 — 서버 안전·순수 로직 기반

| ID | 작업 | 시작 기록 |
| --- | --- | --- |
| 1 | temp-library-safe Python server harness와 fixture 경로 구축 | 완료 기록 |
| 2 | `/stem`의 허용 이름·track root·stem root 검증 강화 | 완료 기록 |
| 3 | Demucs job id 충돌 방지와 stale job 정리 | 완료 기록 |
| 4 | settings/library scan side effect와 `.stems` 제외 테스트 | 완료 기록 |
| 5 | platter, seek, scratch, AudioParam, meter, UI 상태 순수 helper 추출 | 완료 기록 |

### Wave 2 — 디자인 계약·콘솔 UI

| ID | 작업 | 시작 기록 |
| --- | --- | --- |
| 6 | root `DESIGN.md`와 design contract checker 구축 | 완료 기록 |
| 7 | fixed-height performance shell을 responsive grid와 CDP harness로 전환 | 완료 기록 |
| 8 | 색상·상태·focus·disabled·typography를 디자인 계약에 맞게 정리 | 완료 기록 |
| 9 | REC/FX overlay의 dialog semantics, keyboard safety, focus restore, viewport safety | 미완료 |
| 10 | 동작하지 않는 Collection rail 제거 및 확보된 공간 회수 | 미완료 |
| 11 | Library/Browse row의 semantic keyboard operation과 selected state | 미완료 |

### Wave 3 — 믹서·오디오 품질

| ID | 작업 | 시작 기록 |
| --- | --- | --- |
| 12 | crossfader, volume, EQ, filter, FX, stem gain에 공유 AudioParam smoothing 적용 | 미완료 |
| 13 | named master bus, headroom, limiter/compressor 전략과 오디오 harness 구축 | 미완료 |
| 14 | deck A/B와 master `AnalyserNode` meter 추가 | 미완료 |
| 15 | deck audio graph, scratch grains, FX LFO의 dispose/lifecycle과 routing 명시 | 미완료 |
| 16 | mixer/FX mapping, clamp, readout, stem solo/mute 테스트 고정 | 미완료 |

### Wave 4 — Platter·Scratch·Waveform

| ID | 작업 | 시작 기록 |
| --- | --- | --- |
| 17 | pointerup/pointercancel/lost capture/blur/visibility pointer lifecycle 안정화 | 미완료 |
| 18 | loop 범위·duration clamp·cue semantics를 포함한 seek/scrub | 미완료 |
| 19 | grain start/direction/envelope/interval/source cleanup 안정화 | 미완료 |
| 20 | 긴 곡·무음·짧은 버퍼의 waveform peak detail과 다중 해상도 고려 | 미완료 |
| 21 | loaded/playing/vinyl/scratch/loop/cue 상태의 platter 시각 피드백 | 미완료 |

### Wave 5 — Stem·Library workflow

| ID | 작업 | 시작 기록 |
| --- | --- | --- |
| 22 | stem job polling backoff, timeout, missing/error 안전 처리 | 미완료 |
| 23 | no-track/loading/splitting/ready/muted/soloed/error stem UI 상태 | 미완료 |
| 24 | selected/load/BPM/object URL/empty/unsupported/scan-limited 상태 문구와 layout | 미완료 |
| 25 | Library/Browse filter·sort helper 공유와 결과 수 일치 | 미완료 |
| 26 | 최종 master bus와 recording 경로 일치 검증 | 미완료 |

### Wave 6 — 통합 검증·인수

| ID | 작업 | 시작 기록 |
| --- | --- | --- |
| 27 | 전체 JavaScript/Python/syntax 및 plan/scope 검사 | 미완료 |
| 28 | temp-library server smoke와 desktop/tablet/mobile browser QA | 미완료 |
| 29 | 접근성·디자인 시스템·focus·contrast·reduced-motion 감사 | 미완료 |
| 30 | 생성 WAV 두 개를 이용한 agent-driven full DJ audio scenario | 미완료 |

## 8. 작업별 필수 검증

기본 명령:

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py"
python -m py_compile server.py
node tests/design-contract-check.mjs --design DESIGN.md --evidence .omo/evidence/task-<N>-stem-dj-overhaul.md
```

브라우저 QA는 설치된 Chrome/Edge와 저장소 내 CDP harness만 사용한다. 기본 fixture와
증거 경로는 다음과 같다.

```powershell
node tests/browser-qa.mjs `
  --scenario <scenario> `
  --with-temp-server `
  --fixture-dir .omo/tmp/stem-dj-fixtures `
  --viewports 375x812,768x1024,1280x800 `
  --evidence .omo/evidence/task-<N>-stem-dj-overhaul.md
```

오디오 시나리오 harness가 준비된 뒤에는 다음 형식을 사용한다.

```powershell
node tests/audio-scenario.mjs `
  --scenario <scenario> `
  --with-temp-server `
  --fixture-dir .omo/tmp/stem-dj-fixtures `
  --evidence .omo/evidence/task-<N>-stem-dj-overhaul.md
```

필수 viewport:

- `375x812`: 좁은 모바일, overflow와 focus trap 확인
- `768x1024`: tablet, stacked layout과 scrollbar 상호작용 확인
- `1280x800`: 최소 desktop performance console 확인
- `1365x768`: 짧은 laptop 확인
- `1440x900`: 넓은 desktop 확인

브라우저 QA 필수 관찰값:

- uncaught console error 없음
- local asset load 실패 없음
- 수평 overflow·겹침·primary control clipping 없음
- nav, transport, mixer, library, overlay, stem controls가 실제로 도달 가능
- disabled control은 클릭 동작을 발생시키지 않음
- overlay hidden 상태는 tab 대상이 아님
- empty/error/loading/filtered-zero 상태가 레이아웃을 깨뜨리지 않음
- QA 종료 후 브라우저 profile·CDP process·임시 서버가 남지 않음
- fixture 외 실제 음악 경로가 접근되지 않음

오디오 QA 필수 시나리오:

1. synthetic WAV 두 개를 temp library에 만든다.
2. 두 deck에 load하고 play/pause/cue를 실행한다.
3. loop와 platter seek/scratch를 실행한다.
4. crossfader, channel/master volume, EQ, filter를 조절한다.
5. echo, reverb, flanger, phaser, bitcrusher를 조절한다.
6. stem 상태와 mute/solo/volume을 확인한다. 실제 Demucs가 필요하면 mock/no-op
   경계를 사용하고 실제 사용자 음원은 사용하지 않는다.
7. 짧게 녹음하고 `.webm` 생성·크기·상태를 확인한다.
8. 빠른 slider sweep, rapid platter drag, unload 상태, stop-without-start가
   예외·무한 상태·노드 누수를 만들지 확인한다.

## 9. 작업 단위별 실행 절차

각 작업은 다음 순서로 진행한다.

### 시작 전

- 관련 정본 파일과 현재 변경 상태를 읽는다.
- 대상 파일·함수·라우트·DOM selector를 정확히 확인한다.
- 해당 작업의 dependency와 기존 evidence를 확인한다.
- 실제 라이브러리 경로, 설정 파일, 사용자 변경을 보호한다.
- 범위가 달라지거나 외부 전송·게시·삭제가 필요하면 중단하고 승인을 받는다.

### 구현 중

- 가장 작은 변경으로 기능 계약을 만족시킨다.
- 순수 계산은 테스트 가능한 helper로 분리하되 DOM-heavy 코드를 무리하게 옮기지 않는다.
- 기존 URL·설정 스키마·로컬 파일 load 동작을 보존한다.
- 새 UI 토큰은 `DESIGN.md`에 먼저 등록한다.
- 변경한 동작에 해당하는 unit test 또는 browser/audio assertion을 같은 작업에서 추가한다.
- unrelated file, evidence, protected `.omo` records를 수정·삭제하지 않는다.

### 완료 전

- 작업별 acceptance criteria를 하나씩 판정한다.
- 명령 성공, 파일 존재, 테스트 일부 통과만으로 PASS하지 않는다.
- 증거 파일에는 실행 명령, 환경/viewport, 결과, 실패·잔여 위험, cleanup 결과를 남긴다.
- 실패 시 원인을 분류하고 범위 안에서 수정한다. 같은 조건의 무의미한 재시도는 하지 않는다.
- 완료 보고 상태는 `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, `미검증` 중 하나로 쓴다.

## 10. 최종 인수 기준

전체 제작 완료는 다음 조건을 모두 만족할 때만 선언한다.

- `DESIGN.md`가 UI token/layout/state/motion/accessibility 정본으로 존재한다.
- Python server 테스트가 settings, scan, media, stem, job lifecycle을 temp root에서
  검증한다.
- JavaScript 테스트가 platter/scratch/mixer/library/UI 상태의 순수 helper를 검증한다.
- mixer 파라미터가 smoothing되고 deck/master meter가 보이며, master와 recording
  path에 명시적인 headroom 전략이 있다.
- pointer cancel, loop, cue, long track, empty/unloaded 상태에서 platter/scratch/
  waveform이 안정적이다.
- library/stem에 loading, empty, error, selected, ready, mute/solo, timeout 상태가 있다.
- desktop/tablet/mobile 브라우저 QA에서 겹침·clipping·수평 overflow·console error가 없다.
- 생성 fixture 기반 audio QA에서 load, play, cue, loop, scratch, mix, FX, stem/status,
  record가 통제된 결과를 낸다.
- QA 후 임시 파일·브라우저·서버 잔여물이 정리되었다.
- 실제 사용자 음악 폴더와 기존 설정은 의도치 않게 변경되지 않았다.

최종 검증 wave:

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py"
python -m py_compile server.py
node tests/plan-compliance-check.mjs `
  --plan .omo/plans/stem-dj-overhaul.md `
  --evidence-dir .omo/evidence `
  --output .omo/evidence/f1-plan-compliance.md
node tests/scope-fidelity-check.mjs `
  --plan .omo/plans/stem-dj-overhaul.md `
  --evidence-dir .omo/evidence `
  --output .omo/evidence/f4-scope-fidelity.md
```

그리고 fresh state에서 full-smoke browser QA와 full-dj-workflow audio QA를 다시
실행한다. 과거 스크린샷이나 오래된 evidence만으로 최종 PASS를 만들지 않는다.

## 11. 최종 보고 형식

다음 형식으로 짧고 검증 가능하게 보고한다.

```text
전체 판정: PASS / PARTIAL / BLOCKED / FAIL

완료:
- [기능 또는 작업 ID] — [변경 내용]

산출물:
- [절대 경로]

검증:
- [명령] — PASS/FAIL, 핵심 수치
- [브라우저/오디오 QA] — viewport, fixture, 증거 경로

미검증·잔여 위험:
- [내용과 이유]

다음 작업:
- [필요한 후속 작업 또는 사용자 판단]
```

## 12. 저장·전달 규칙

이 통합 프롬프트를 포함한 모든 최종 작업물 프롬프트의 고정 저장 위치:

```text
G:\내 드라이브\06 Obsidian Vault\05\_Claude-AI\프롬프트
```

프로젝트 내부의 작업 사본은 다음 경로에 유지할 수 있지만, 최종 프롬프트는 반드시
위의 고정 폴더에도 저장한다.

```text
D:\Ai 산출물\stem-dj\docs\STEM-DJ-PRODUCTION-PROMPT.md
```

고정 폴더 안의 파일명은 작업 내용을 식별할 수 있게 정한다. 기존 파일을 덮어쓸
때는 같은 프롬프트의 최신본인지 먼저 확인하고, 다른 작업물이라면 새 파일명으로
보존한다.

지정 경로로 전달할 때는 다음 원칙을 따른다.

1. 사용자가 지정한 정확한 서비스명 또는 절대 경로를 먼저 확인한다.
2. 대상이 기존 파일이면 덮어쓰기 여부와 영향 범위를 확인한다.
3. 외부 전송은 전송 성공 응답 또는 대상 재조회로 확인한다.
4. 이 프로젝트에서는 위의 G: 경로를 지정된 정본 저장소로 사용한다.
5. 전송 후에는 원본 경로, 대상 경로, 파일명, 전송 시각, 성공 여부를 보고한다.

## 13. 금지 사항 요약

- 실제 음악 라이브러리로 QA하지 않는다.
- 사용자 `settings.json`을 임의로 바꾸지 않는다.
- 테스트를 약화·삭제해서 녹색으로 만들지 않는다.
- 새 브라우저 dependency를 설치하지 않는다.
- 프레임워크를 교체하지 않는다.
- 마케팅형 레이아웃, 장식용 motion, 무의미한 gradient를 추가하지 않는다.
- path traversal, 파일 경로 노출, 중복 audio graph, stale job 방치를 허용하지 않는다.
- 미검증 상태를 완료로 표현하지 않는다.
- 사용자가 지정하지 않은 외부 게시·공유·전송·삭제를 실행하지 않는다.

이 프롬프트의 모든 구현·검증 판단은 현재 코드와 `README.md`, `DESIGN.md`,
`.omo/plans/stem-dj-overhaul.md`의 실제 내용이 우선하며, 문서와 코드가 충돌하면
충돌을 보고하고 임의로 한쪽을 폐기하지 않는다.
