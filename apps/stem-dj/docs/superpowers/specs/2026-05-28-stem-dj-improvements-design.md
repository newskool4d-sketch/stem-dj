# Stem DJ Lab — 개선 설계 명세

작성일: 2026-05-28

---

## Phase 1 — DJ 워크플로우 핵심

### A. 채널 볼륨 페이더 (Option A)

오디오 그래프에 `chanGain` 노드를 `bitcrusher`와 `deckGain(crossGain)` 사이에 삽입.

```
bitcrusher → chanGain(채널 페이더) → crossGain(크로스페이더) → masterGain
```

- `deckGain` → 이름·역할 유지, 크로스페이더가 제어
- `chanGain` 추가, 채널 볼륨 슬라이더(0-100%) 제어
- UI: 믹서 패널 MIXER 탭에 `VOL` 행 추가 (HI/MID/LOW 동일 형식)

### B. 키보드 단축키 (Option A — 좌우 분할)

| 키 | 동작 |
|---|---|
| Space | Deck A 재생/정지 |
| Enter | Deck B 재생/정지 |
| 1-4 | Deck A Hot Cue 1-4 |
| 7,8,9,0 | Deck B Hot Cue 1-4 |
| Q/W/E/R | Deck A Loop ½/1/4/8 |
| T | Deck A Loop off |
| U/I/O/P | Deck B Loop ½/1/4/8 |
| [ | Deck B Loop off |
| ←/→ | Deck A 5초 이동 |
| Shift+←/→ | Deck B 5초 이동 |

input/select/textarea 포커스 시 비활성화.

### C. Cue / Hot Cue 분리

- **Cue 버튼** (CDJ 표준): 재생 중 → `mainCue` 저장 + 일시정지 / 정지 중 → `mainCue`로 점프
- **Hot Cue 1-4** (`this.cues[]`): 클릭=설정 또는 점프, Shift+클릭=삭제, 버튼에 시간 표시
- `Deck.mainCue = null` 프로퍼티 신설, `cues[0]` 혼용 제거
- Loop strip에 2-beat 버튼 추가

---

## Phase 2 — 오디오 품질

### A. BPM 감지 개선

에너지 플럭스 자기상관(autocorrelation) 방식 교체:
- 11ms 블록 에너지 계산 → 양방향 에너지 플럭스(onset) 도출
- lag 범위 = 60–200 BPM에 해당하는 샘플 수
- 자기상관 최대값 → BPM 도출
- 최초 90초만 사용 (속도 최적화)

### B. Loop 오버슛 수정

```js
const overshoot = el.currentTime - this.loopEnd;
this.jumpTo(this.loopStart + (overshoot % loopLen));
```

위치 보정으로 박자 위상 유지.

### C. Zoom 파형 고해상도

`analyze()` 시 두 가지 피크 배열 생성:
- `wavePeaks`: 1200점 (개요)
- `zoomPeaks`: 6000점 (줌 전용)

`drawZoomWave()`에서 `zoomPeaks` 우선 사용.

---

## Phase 3 — 안정성·유지보수

### A. 메모리 누수 수정

- `localObjectUrls`: `refreshLibrary()` 호출 시 덱에서 사용하지 않는 URL만 revoke 후 목록 정리
- `recAnalyser`: `masterGain.connect` 중복 방지 — 최초 1회만 연결

### B. 서버 로그

`start-stem-dj.ps1`에서 stdout → `server.out.log`, stderr → `server.err.log` 리디렉션.

### C. EQ 수치 표시

각 EQ 슬라이더 옆에 dB 값 표시 (`+3`, `-18` 등).
`meter-block` 컬럼에 28px 리드아웃 컬럼 추가.
