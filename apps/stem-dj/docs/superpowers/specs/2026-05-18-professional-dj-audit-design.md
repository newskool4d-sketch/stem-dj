# Stem DJ — 전문 DJ 관점 기능 점검 및 개선 설계

날짜: 2026-05-18  
상태: 진행 승인됨

---

## 목표

`Stem DJ Lab`을 전문 DJ가 직접 공연·연습에 사용한다는 관점에서 점검하고, 즉시 체감되는 운용성 개선을 우선 적용한다.

핵심 기준은 다음 5가지다.

1. 다음 곡을 빠르게 찾고 Deck A/B에 올릴 수 있는가
2. 재생 중 현재 상태를 한눈에 파악할 수 있는가
3. 믹싱 중 탭·패널 전환이 흐름을 끊지 않는가
4. FX·EQ·Crossfader 조작이 즉각적이고 예측 가능한가
5. 녹음·Stem Split처럼 시간이 걸리는 기능의 상태가 명확한가

---

## 현재 상태 요약

앱은 Python 표준 HTTP 서버와 Vanilla JS/Web Audio 기반의 2-deck DJ 웹앱이다.

구현된 주요 기능:

- Deck A/B 재생
- 라이브러리 스캔 및 파일 로드
- 파형·상세 파형 표시
- BPM 간이 분석 및 `localStorage` 캐시
- Tempo, Cue, Loop, Sync, Crossfader
- Stem Split 및 stem별 mute/solo/volume
- EQ, Filter, Echo, Reverb
- Flanger, Phaser, Bitcrusher FX overlay
- REC overlay 및 mix recording
- LIBRARY/BROWSE/REC/FX 탭 활성화

최근 작업 이력상 탭 활성화와 FX overlay 개선은 이미 상당 부분 반영되어 있다. 이번 작업은 새 대형 기능보다 실제 사용성·안정성·표시 품질 개선에 집중한다.

---

## 전문 DJ 관점의 점검 기준

### 1. Track 준비 속도

전문 DJ에게 가장 중요한 흐름은 “현재 곡을 틀면서 다음 곡을 찾고 준비하는 것”이다.

점검 항목:

- Library 검색·정렬·필터가 지연 없이 작동하는지
- Track 행에서 Deck A/B 로드가 명확한지
- 현재 선택된 곡과 각 Deck에 로드된 곡이 혼동되지 않는지
- BPM 미분석 상태와 분석 완료 상태가 구분되는지

개선 방향:

- Deck load 버튼의 피드백 강화
- 현재 선택/로드 상태 표시 개선
- BPM 미분석 트랙 표시를 명확히 유지

### 2. Deck 운용성

Deck은 공연 중 실수 비용이 큰 영역이다. Play, Cue, Loop, Tempo 조작은 상태 전환이 예측 가능해야 한다.

점검 항목:

- Play/Pause 버튼 텍스트가 실제 재생 상태와 일치하는지
- Cue 버튼과 hot cue가 현재 위치 기준으로 직관적으로 작동하는지
- Loop on/off 상태가 Deck별로 분명한지
- Sync B to A가 Deck A 미로드/무BPM 상태에서 안전하게 안내되는지

개선 방향:

- 불가능한 조작에는 조용한 실패 대신 상태 로그 안내
- Loop·Tempo·BPM 상태 표시 가독성 개선
- Deck별 로드 완료 로그 유지

### 3. 믹싱 중 시야

전문 DJ는 화면 전체를 읽는 것이 아니라 필요한 정보만 빠르게 스캔한다.

점검 항목:

- PERFORM 화면에서 파형, BPM, 시간, Tempo, Crossfader, EQ가 한눈에 들어오는지
- LIBRARY/BROWSE 전체 탭 이동 시 재생 맥락을 잃지 않는지
- REC/FX overlay가 Deck 조작을 과도하게 가리지 않는지
- 로그가 중요한 상태를 묻어버리지 않는지

개선 방향:

- 탭 전환 후 현재 Deck 상태 유지 확인
- overlay 닫기·재진입 동작 검증
- 작은 화면에서 overflow 문제 확인

### 4. FX 즉응성

FX는 소리 변화가 즉각적이어야 하고, 같은 파라미터를 조작하는 슬라이더는 서로 값이 어긋나면 안 된다.

점검 항목:

- Filter/Echo/Reverb utility slider와 FX overlay slider가 동기화되는지
- Flanger/Phaser/Bitcrusher wet 조작이 실시간 반영되는지
- AudioWorklet 미지원 또는 로딩 실패 시 앱 전체가 깨지지 않는지
- Deck 미로드 상태에서 FX 조작 시 오류가 없는지

개선 방향:

- FX overlay 진입 시 값 동기화 확인
- Bitcrusher 로딩 실패 메시지 보강
- 필요 시 slider input 이벤트 경로 단순화

### 5. REC 및 Stem Split 안정성

녹음과 stem 분리는 시간이 걸리거나 결과물이 남는 기능이므로 사용자 신뢰가 중요하다.

점검 항목:

- Record 시작·중지·Download link 생성이 일관적인지
- REC overlay timer와 topbar 버튼 상태가 동기화되는지
- 녹음 중 탭 전환이 문제를 만들지 않는지
- Demucs 미설치 상태 안내가 충분히 명확한지
- Stem job polling 완료·실패 상태가 Deck에 반영되는지

개선 방향:

- REC 상태 텍스트와 다운로드 가능 상태 강화
- Stem Split 처리 중 중복 요청 방지 검토
- 실패 메시지를 사용자 행동 중심으로 정리

---

## 접근 방식

### 선택한 접근: 실사용 품질 점검 우선

이번 작업은 다음 순서로 진행한다.

1. 서버를 실행한다.
2. 브라우저에서 실제 UI를 열어 탭·Deck·Library·FX·REC 흐름을 확인한다.
3. 발견사항을 `필수 수정`, `권장 개선`, `장기 기능`으로 분류한다.
4. 필수 수정과 작은 권장 개선만 즉시 반영한다.
5. 브라우저에서 다시 검증한다.

### 제외 범위

이번 작업에서는 다음은 구현하지 않는다.

- Headphone cue/pre-listen
- Beatgrid 수동 편집
- Persistent cue memory
- Controller/MIDI mapping
- Quantize, key detection, harmonic mixing
- 대형 UI 리디자인

이 기능들은 전문 DJ 앱으로 가는 장기 개선 후보이나, 현재 앱의 안정성 점검 후 별도 설계가 필요하다.

---

## 개선 우선순위

| 우선순위 | 항목 | 기준 |
|---|---|---|
| 필수 수정 | 콘솔 오류, 재생 불능, 탭 전환 오류, 녹음 실패 | 실제 사용을 막는 문제 |
| 권장 개선 | 상태 표시, 버튼 피드백, 안내 메시지, 작은 UI 정리 | 공연 흐름을 덜 방해하게 하는 문제 |
| 장기 기능 | cue memory, headphone cue, beatgrid, MIDI | 별도 설계가 필요한 전문 기능 |

---

## 검증 계획

브라우저에서 다음 흐름을 확인한다.

1. 앱 첫 로드
   - `/api/library` 호출 성공
   - 기본 PERFORM 화면 표시
   - 콘솔 오류 없음

2. 라이브러리
   - Refresh
   - Search
   - LIBRARY 탭 검색·필터·정렬
   - BROWSE 탭 BPM/stem/type 필터

3. Deck
   - Track 선택
   - Load selected to A/B
   - Play/Pause
   - Tempo 변경
   - Loop on/off
   - Sync B to A

4. FX
   - Center mixer MIXER/FX/FILTER 전환
   - FX overlay 진입/닫기
   - Filter/Echo/Reverb 동기화
   - Flanger/Phaser/Bitcrusher 조작

5. REC
   - Record 시작
   - Timer 진행
   - Stop
   - Download link 생성

6. Stem Split
   - Demucs 감지 상태 표시
   - 미설치 또는 처리 실패 시 안내 메시지 확인

---

## 완료 기준

작업 완료는 다음 조건을 만족해야 한다.

- 앱이 로컬 서버에서 정상 기동된다.
- 주요 탭이 브라우저에서 열리고 전환된다.
- 전문 DJ 운용 기준의 필수 오류가 수정된다.
- 수정한 항목은 브라우저 또는 명령으로 검증된다.
- 장기 개선 후보는 별도로 정리하되 이번 범위에 섞지 않는다.
