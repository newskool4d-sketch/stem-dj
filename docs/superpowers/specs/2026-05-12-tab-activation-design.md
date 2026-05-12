# Stem DJ — 탭 활성화 설계 스펙

날짜: 2026-05-12  
상태: 승인됨

---

## 배경 및 목표

현재 `index.html`의 nav 탭 5개 중 PERFORM만 동작하고 LIBRARY·BROWSE·REC·FX는 `disabled` 상태다.  
이 4개 탭을 활성화해 DJ 워크플로우를 완성한다.

---

## 탭 전환 전략 — 혼합(Hybrid)

| 탭 | 방식 | 이유 |
|----|------|------|
| PERFORM | 현행 유지 | 핵심 DJ 화면 |
| LIBRARY | 전체 페이지 교체 | 넓은 트랙 목록 필요 |
| BROWSE | 전체 페이지 교체 | 필터 사이드바 + 결과 목록 |
| REC | 오버레이 패널 | 짧게 쓰는 기능, PERFORM 유지 필요 |
| FX | 오버레이 패널 | 믹싱 중 실시간 조작, PERFORM 유지 필요 |

**오버레이**: PERFORM 화면 위에 고정 패널이 슬라이드 인. 탭 재클릭 또는 ✕ 버튼으로 닫힘.  
**전체 페이지**: `main` 영역과 하단 섹션을 숨기고 탭 전용 뷰를 표시. 오디오는 계속 재생.

---

## 각 탭 상세 설계

### 1. LIBRARY 탭 (전체 페이지)

**PERFORM 하단 패널은 변경 없음.** LIBRARY 탭은 별도 강화 뷰.

#### 레이아웃
```
[ Search input ] [ Filter: All/Stems Ready/No Stems ] [ Sort: Title/BPM/Size/Date ] [ Refresh ]

| Title         | Filename           | BPM | Size  | Stems  | Actions   |
|---------------|--------------------|-----|-------|--------|-----------|
| Midnight Drive| midnight_drive.mp3 | 128 | 8 MB  | ✓      | [A] [B]   |
| Solar Winds   | solar_winds.wav    | —   | 42 MB | —      | [A] [B]   |

N tracks · Library: <path>
```

#### 기능
- **BPM 컬럼**: `analyze()` 결과를 `localStorage`에 `stemDJ_bpm_<tid>` 키로 캐시. 서버 재시작 후에도 유지.
- **Filter**: All Tracks / Stems Ready / No Stems — 클라이언트 사이드 필터링
- **Sort**: Title(기본) / BPM / Size / Date(수정일) — 클라이언트 사이드 정렬
- **Load A/B 버튼**: 행에서 바로 Deck A 또는 B로 로드. 선택(`selectedTrack`) 상태도 동시 갱신.
- Search: 기존 `#search`와 동일 로직, LIBRARY 탭 전용 입력 필드 사용

#### 서버 변경 없음
BPM은 클라이언트 분석 결과를 `localStorage`에 저장하므로 서버 API 변경 불필요.

---

### 2. BROWSE 탭 (전체 페이지)

메타데이터 기반 필터 브라우저. LIBRARY의 "고급 검색" 역할.

#### 레이아웃
```
┌─ FILTERS ──────┐  ┌─ RESULTS ──────────────────────────────────────────┐
│ BPM RANGE      │  │ N results matching filters                          │
│ [80] – [180]   │  │                                                     │
│                │  │ Midnight Drive  128 BPM · mp3 · 8 MB [stems ✓] A B │
│ STEMS          │  │ Bass Drop       140 BPM · flac · 55 MB [no stems] A B│
│ ☑ Ready        │  │                                                     │
│ ☑ Not split    │  └─────────────────────────────────────────────────────┘
│                │
│ FILE TYPE      │
│ ☑ mp3 ☑ wav   │
│ ☐ flac         │
│                │
│ [Apply]        │
│ [Reset]        │
└────────────────┘
```

#### 기능
- BPM 필터: `localStorage` 캐시 값 사용. BPM 미분석 트랙은 "—"로 표시되며 BPM 필터 적용 시 제외.
- 파일 타입 필터: 확장자 기준 체크박스 다중 선택
- Stems 필터: stems 완료 여부 기준
- Apply 버튼으로 필터 적용 (실시간 적용도 고려하나 Apply 방식 우선)
- Load A/B: LIBRARY 탭과 동일 동작

---

### 3. REC 탭 (오버레이)

최소 기능. 기존 topbar `#recordBtn`과 상태를 공유한다.

#### 레이아웃
```
┌─ REC ──────────────────────────┐
│        ● 00:02:34              │
│  [ 레벨 바 ████████░░░░ ]      │
│  [ Stop ]  [ Download .webm ]  │
│  topbar Record 버튼과 동기화   │
└────────────────────────────────┘
```

#### 기능
- 타이머: 녹음 시작 시 경과 시간 표시 (`setInterval` 1초)
- 레벨 바: `AnalyserNode`를 `recorderDestination` 앞에 삽입해 실시간 RMS 표시
- Stop: `mediaRecorder.stop()` 호출 — topbar 버튼과 동일 핸들러 재사용
- Download: 기존 `#downloadMix` 링크 트리거
- topbar `#recordBtn` 텍스트와 REC 탭 버튼 상태 동기화 (단일 `mediaRecorder` 인스턴스)

---

### 4. FX 탭 (오버레이)

기존 utility row FX(Filter·Echo·Reverb)는 그대로 유지. FX 탭에 3종 추가 이펙터 제공.

#### 레이아웃
```
┌─ FX ─────────────────────────────────────────────┐
│  DECK A                    DECK B                 │
│  Filter   [────────]       Filter   [────────]    │
│  Echo     [────────]       Echo     [────────]    │
│  Reverb   [────────]       Reverb   [────────]    │
│  ─────────────────────     ─────────────────────  │
│  Flanger  [────────]       Flanger  [────────]    │
│  Phaser   [────────]       Phaser   [────────]    │
│  Bitcrush [────────]       Bitcrush [────────]    │
└──────────────────────────────────────────────────┘
```

#### 추가 이펙터 Web Audio 구현

**Flanger**  
- `DelayNode` (delay: 0.002–0.015s) + `OscillatorNode`(LFO, ~0.25Hz)로 delay time 변조  
- wet/dry 믹스: `GainNode` 2개

**Phaser**  
- `BiquadFilter` (type: `allpass`) 4단 직렬  
- `OscillatorNode` LFO로 각 필터의 `frequency` 변조  
- 원신호와 위상 변이 신호를 합산

**Bitcrusher**  
- `AudioWorkletProcessor` 구현 (`bitcrusher-processor.js`)  
- 파라미터: `bits` (4–16), `frequencyReduction` (0–1)  
- `AudioWorklet` 미지원 환경 폴백: `ScriptProcessorNode` (deprecated이나 호환성 보장)

#### FX 탭 슬라이더와 utility row 슬라이더 관계
- utility row의 Filter/Echo/Reverb 슬라이더는 그대로 동작
- FX 탭 내의 Filter/Echo/Reverb 슬라이더는 동일 `AudioNode`에 연결 → 양쪽 슬라이더가 동일 값을 반영하도록 동기화
- 추가 3종(Flanger·Phaser·Bitcrush)은 FX 탭 전용

---

## 공통 구현 사항

### JS 탭 전환 로직

```js
// 전체 페이지 탭: perform-view / library-view / browse-view
// 오버레이 탭: rec-overlay / fx-overlay

function activateTab(tabName) {
  // 전체 페이지 탭 처리
  // 오버레이 탭은 toggleOverlay()
}
```

- `activeTab` 상태 변수 하나로 관리
- 오디오 그래프는 탭 전환과 무관하게 유지

### HTML 구조 변경

```
<main class="perform-view">  ← 기존 perform-grid + utility-row + zoom-row
<section class="library-view" hidden>
<section class="browse-view" hidden>
<div class="overlay rec-overlay" hidden>
<div class="overlay fx-overlay" hidden>
```

### BPM 캐시

```js
// 저장
localStorage.setItem(`stemDJ_bpm_${tid}`, bpm);
// 조회
const bpm = localStorage.getItem(`stemDJ_bpm_${tid}`);
```

`libraryTracks` 배열에 `bpm` 필드를 병합해 LIBRARY·BROWSE 탭에서 표시.

---

## 코드 버그 수정 (리뷰 우선순위 병행)

탭 활성화와 함께 다음 버그도 수정한다:

| 우선순위 | 항목 | 수정 방법 |
|---------|------|-----------|
| 즉시 | temp 디렉토리 미정리 | `run_demucs_job` 완료 후 `shutil.rmtree(out_root)` |
| 권장 | `translate_path` 경로 이탈 | `is_relative_to(STATIC_DIR)` 체크 추가 |
| 권장 | innerHTML XSS | `textContent` / `createTextNode` 전환 |
| 개선 | ObjectURL 누수 | `revokeObjectURL` 호출 |
| 개선 | JOBS TTL | 완료 job 1시간 후 정리 |
| 선택 | EQ 램프 | `setTargetAtTime` 적용 |

---

## 범위 외 (이번 스펙에서 제외)

- 플레이리스트 관리
- 클라우드/스트리밍 연동
- 키(Key) 감지
- MIDI 컨트롤러 지원
