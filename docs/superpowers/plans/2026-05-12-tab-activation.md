# Stem DJ 탭 활성화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LIBRARY·BROWSE·REC·FX 탭 활성화 + 코드 버그 5종 수정

**Architecture:** LIBRARY·BROWSE는 전체 페이지 뷰 교체, REC·FX는 PERFORM 위 오버레이 패널. JS `activateTab()` 함수 하나로 상태 관리. 오디오 그래프는 탭 전환과 무관하게 유지. BPM은 `localStorage`에 캐시.

**Tech Stack:** Python 3 (stdlib HTTP server), Vanilla JS (Web Audio API, AudioWorklet), HTML5, CSS3

---

## 파일 구조

| 파일 | 변경 내용 |
|------|-----------|
| `server.py` | translate_path 보안 수정, temp 디렉토리 정리, JOBS TTL |
| `static/index.html` | perform-view 래퍼, library-view, browse-view, rec-overlay, fx-overlay 섹션 추가, nav disabled 제거 |
| `static/styles.css` | tab-view, overlay, lib-table, browse-layout, rec-content, fx-overlay-grid 스타일 추가 |
| `static/app.js` | activateTab, BPM 캐시, renderLibraryTab, renderBrowseTab, REC overlay, FlangerNode, PhaserNode, FX overlay 바인딩, XSS 수정, ObjectURL 해제 |
| `static/bitcrusher-processor.js` | AudioWorkletProcessor 신규 파일 |

---

## Task 1: 서버 버그 수정

**Files:**
- Modify: `server.py`

- [ ] **Step 1: translate_path 경로 이탈 방어**

`server.py` 의 `translate_path` 메서드(242–247줄)를 다음으로 교체:

```python
def translate_path(self, path: str) -> str:
    parsed = urlparse(path)
    clean = unquote(parsed.path).lstrip("/")
    if not clean:
        clean = "index.html"
    resolved = (STATIC_DIR / clean).resolve()
    if not resolved.is_relative_to(STATIC_DIR):
        return str(STATIC_DIR / "__traversal_blocked__")  # 존재하지 않는 경로 → 404
    return str(resolved)
```

- [ ] **Step 2: 동작 확인**

```powershell
python -c "
import sys; sys.path.insert(0,'C:/Users/홍주형/workspace/apps/stem-dj')
from server import StemDJHandler, STATIC_DIR
from pathlib import Path
h = StemDJHandler.__new__(StemDJHandler)
safe = Path(h.translate_path('/app.js'))
assert safe.is_relative_to(STATIC_DIR), f'FAIL safe: {safe}'
blocked = Path(h.translate_path('/../../../etc/passwd'))
assert not blocked.is_relative_to(STATIC_DIR), f'FAIL traversal: {blocked}'
print('PASS: translate_path 경로 이탈 방어 OK')
"
```

Expected: `PASS: translate_path 경로 이탈 방어 OK`

- [ ] **Step 3: run_demucs_job temp 디렉토리 정리**

`server.py` 의 `run_demucs_job` 함수에서 `shutil.copy2` 루프 직후(226줄 아래)에 추가:

```python
        for name in STEM_NAMES:
            shutil.copy2(produced / f"{name}.wav", target / f"{name}.wav")
        shutil.rmtree(out_root, ignore_errors=True)  # ← 추가
        set_job(...)
```

- [ ] **Step 4: JOBS TTL 정리 함수 추가**

`set_job` 함수 바로 뒤(237줄 아래)에 추가:

```python
def purge_old_jobs() -> None:
    cutoff = time.time() - 3600  # 1시간 경과 job 제거
    with JOBS_LOCK:
        stale = [jid for jid, j in JOBS.items()
                 if j.get("status") in ("done", "error") and j.get("updated", 0) < cutoff]
        for jid in stale:
            del JOBS[jid]
```

그리고 `run_demucs_job` 함수 첫 줄에 `purge_old_jobs()` 호출 추가:

```python
def run_demucs_job(job_id: str, tid: str) -> None:
    purge_old_jobs()  # ← 추가
    source = safe_track_path(tid)
    ...
```

- [ ] **Step 5: 서버 임시 기동 확인**

```powershell
cd C:\Users\홍주형\workspace\apps\stem-dj
python server.py
```

Expected: `Stem DJ running at http://127.0.0.1:8765` 출력. Ctrl+C로 종료.

- [ ] **Step 6: 커밋**

```bash
git add server.py
git commit -m "fix: path traversal guard, demucs temp cleanup, JOBS TTL purge"
```

---

## Task 2: HTML 구조 개편

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: nav 버튼 disabled 제거 및 data-tab 속성 추가**

`index.html` 의 nav-tabs 블록(13–18줄)을 다음으로 교체:

```html
    <nav class="nav-tabs">
      <button class="active" data-tab="PERFORM">PERFORM</button>
      <button data-tab="LIBRARY">LIBRARY</button>
      <button data-tab="BROWSE">BROWSE</button>
      <button data-tab="REC">REC</button>
      <button data-tab="FX">FX</button>
    </nav>
```

- [ ] **Step 2: PERFORM 콘텐츠를 perform-view 래퍼로 감싸기**

`<section class="global-wave">` 앞에 `<div id="performView" class="tab-view">` 추가.  
`</section>` (library-zone 닫는 태그) 뒤에 `</div>` 추가.

결과 구조:
```html
  </header>

  <div id="performView" class="tab-view">
    <section class="global-wave">...</section>
    <main class="perform-grid">...</main>
    <section class="utility-row">...</section>
    <section class="zoom-row">...</section>
    <section class="library-zone">...</section>
  </div>
```

- [ ] **Step 3: LIBRARY 뷰 추가**

`</div>` (performView 닫기) 바로 뒤에 삽입:

```html
  <!-- LIBRARY 탭 전체 뷰 -->
  <div id="libraryView" class="tab-view" hidden>
    <div class="lib-toolbar">
      <input id="libSearch" type="search" placeholder="Search...">
      <select id="libFilter">
        <option value="all">All Tracks</option>
        <option value="stems">Stems Ready</option>
        <option value="nostems">No Stems</option>
      </select>
      <select id="libSort">
        <option value="title">Sort: Title</option>
        <option value="bpm">Sort: BPM</option>
        <option value="size">Sort: Size</option>
        <option value="modified">Sort: Date</option>
      </select>
      <button id="libRefresh">Refresh</button>
    </div>
    <div class="lib-table">
      <div class="lib-head">
        <span>#</span><span>Title</span><span>Filename</span>
        <span>BPM</span><span>Size</span><span>Stems</span><span>Load</span>
      </div>
      <div id="libRows"></div>
    </div>
    <div id="libStatus" class="lib-status"></div>
  </div>
```

- [ ] **Step 4: BROWSE 뷰 추가**

LIBRARY 뷰 바로 뒤에 삽입:

```html
  <!-- BROWSE 탭 전체 뷰 -->
  <div id="browseView" class="tab-view" hidden>
    <div class="browse-layout">
      <aside class="browse-filters">
        <strong>FILTERS</strong>
        <div class="filter-group">
          <label class="filter-label">BPM RANGE</label>
          <div class="bpm-range">
            <input id="bpmMin" type="number" value="60" min="40" max="220">
            <span>–</span>
            <input id="bpmMax" type="number" value="200" min="40" max="220">
          </div>
        </div>
        <div class="filter-group">
          <label class="filter-label">STEMS</label>
          <label><input id="fStemsReady" type="checkbox" checked> Ready</label>
          <label><input id="fStemsNo" type="checkbox" checked> Not split</label>
        </div>
        <div class="filter-group">
          <label class="filter-label">FILE TYPE</label>
          <label><input id="fExt_mp3" type="checkbox" checked> mp3</label>
          <label><input id="fExt_wav" type="checkbox" checked> wav</label>
          <label><input id="fExt_flac" type="checkbox" checked> flac</label>
          <label><input id="fExt_m4a" type="checkbox" checked> m4a</label>
        </div>
        <button id="browseApply">Apply</button>
        <button id="browseReset">Reset</button>
      </aside>
      <section class="browse-results">
        <div id="browseCount" class="browse-count"></div>
        <div id="browseRows"></div>
      </section>
    </div>
  </div>
```

- [ ] **Step 5: REC 오버레이 추가**

BROWSE 뷰 바로 뒤에 삽입:

```html
  <!-- REC 오버레이 -->
  <div id="recOverlay" class="overlay" hidden>
    <div class="overlay-panel">
      <div class="overlay-header">
        <span>REC</span>
        <button class="overlay-close" data-close="recOverlay">✕</button>
      </div>
      <div class="rec-content">
        <div id="recTimer" class="rec-timer">00:00:00</div>
        <canvas id="recLevel" width="380" height="28"></canvas>
        <div class="rec-actions">
          <button id="recToggle" class="danger">Record</button>
          <a id="recDownload" class="rec-download" hidden>Download .webm</a>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 6: FX 오버레이 추가**

REC 오버레이 바로 뒤에 삽입:

```html
  <!-- FX 오버레이 -->
  <div id="fxOverlay" class="overlay" hidden>
    <div class="overlay-panel overlay-wide">
      <div class="overlay-header">
        <span>FX</span>
        <button class="overlay-close" data-close="fxOverlay">✕</button>
      </div>
      <div class="fx-overlay-grid">
        <div class="fx-col">
          <h3 style="color:var(--purple)">DECK A</h3>
          <label>Filter <input id="fxFilterA" type="range" min="-100" max="100" value="0"></label>
          <label>Echo <input id="fxEchoA" type="range" min="0" max="80" value="0"></label>
          <label>Reverb <input id="fxReverbA" type="range" min="0" max="70" value="0"></label>
          <hr class="fx-divider">
          <label>Flanger <input id="fxFlangerA" type="range" min="0" max="100" value="0"></label>
          <label>Phaser <input id="fxPhaserA" type="range" min="0" max="100" value="0"></label>
          <label>Bitcrush <input id="fxBitcrushA" type="range" min="0" max="100" value="0"></label>
        </div>
        <div class="fx-col">
          <h3 style="color:var(--blue)">DECK B</h3>
          <label>Filter <input id="fxFilterB" type="range" min="-100" max="100" value="0"></label>
          <label>Echo <input id="fxEchoB" type="range" min="0" max="80" value="0"></label>
          <label>Reverb <input id="fxReverbB" type="range" min="0" max="70" value="0"></label>
          <hr class="fx-divider">
          <label>Flanger <input id="fxFlangerB" type="range" min="0" max="100" value="0"></label>
          <label>Phaser <input id="fxPhaserB" type="range" min="0" max="100" value="0"></label>
          <label>Bitcrush <input id="fxBitcrushB" type="range" min="0" max="100" value="0"></label>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 7: 커밋**

```bash
git add static/index.html
git commit -m "feat: add perform-view wrapper, library/browse views, rec/fx overlays"
```

---

## Task 3: CSS — 새 UI 요소 스타일

**Files:**
- Modify: `static/styles.css`

- [ ] **Step 1: tab-view, overlay 기본 스타일 추가**

`styles.css` 파일 끝에 추가:

```css
/* ── Tab Views ──────────────────────────────── */
.tab-view[hidden] { display: none; }

/* LIBRARY · BROWSE 전체 뷰: topbar 제외 전체 높이 */
#libraryView, #browseView {
  height: calc(100vh - 44px);
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 8px;
  overflow: hidden;
}

/* ── Overlay ─────────────────────────────────── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 7, 10, .72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.overlay[hidden] { display: none; }

.overlay-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  width: 420px;
  max-height: 90vh;
  overflow: auto;
  padding: 18px 20px;
  box-shadow: 0 12px 40px #00000088;
}

.overlay-wide { width: 720px; }

.overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-weight: 700;
  font-size: 1rem;
  color: var(--purple);
  letter-spacing: .06em;
}

.overlay-close {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 2px 6px;
}

.overlay-close:hover { color: var(--text); }

/* ── LIBRARY 탭 ──────────────────────────────── */
.lib-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.lib-toolbar input[type="search"],
.lib-toolbar select {
  background: #080b10;
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 4px;
  padding: 7px 10px;
  font: inherit;
}

.lib-toolbar input[type="search"] { flex: 1; }

.lib-table {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  min-height: 0;
}

.lib-head, .lib-row {
  display: grid;
  grid-template-columns: 38px 1fr 1.2fr 72px 72px 72px 80px;
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  font-size: .82rem;
}

.lib-head {
  background: #0f1319;
  color: var(--purple);
  font-weight: 700;
  font-size: .75rem;
  letter-spacing: .04em;
  flex-shrink: 0;
}

.lib-row {
  border-top: 1px solid #1b222d;
  cursor: pointer;
}

.lib-row:hover { background: #141820; }
.lib-row.selected { background: #1b2230; outline: 1px solid var(--purple); }

#libRows {
  overflow-y: auto;
  flex: 1;
}

.lib-row strong { font-size: .86rem; }
.lib-row span { color: var(--muted); font-size: .78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bpm-val { color: var(--yellow) !important; font-weight: 600; }
.stems-ready { color: var(--green) !important; }
.lib-actions { display: flex; gap: 4px; }

.load-btn {
  padding: 3px 8px;
  font-size: .75rem;
  font-weight: 700;
}
.load-btn-a { border-color: var(--purple); color: var(--purple); }
.load-btn-b { border-color: var(--blue); color: var(--blue); }

.lib-status {
  font-size: .74rem;
  color: var(--muted);
  flex-shrink: 0;
}

/* ── BROWSE 탭 ───────────────────────────────── */
.browse-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.browse-filters {
  background: linear-gradient(180deg, #151a22, #0d1015);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.browse-filters strong {
  font-size: .75rem;
  letter-spacing: .06em;
  color: var(--purple);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.filter-label {
  font-size: .7rem;
  color: var(--muted);
  letter-spacing: .04em;
}

.bpm-range {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bpm-range input {
  width: 56px;
  background: #080b10;
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 4px;
  padding: 4px 6px;
  font: inherit;
  font-size: .82rem;
  text-align: center;
}

.bpm-range span { color: var(--muted); }

.browse-filters label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: .82rem;
  cursor: pointer;
}

.browse-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.browse-count {
  font-size: .76rem;
  color: var(--muted);
  flex-shrink: 0;
}

.browse-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(180deg, #151a22, #0d1015);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 14px;
  gap: 12px;
}

.browse-info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.browse-info strong { font-size: .88rem; }
.browse-meta { color: var(--muted); font-size: .76rem; }
.badge-stems { background: #31c4a820; color: #31c4a8; border-radius: 3px; padding: 1px 7px; font-size: .72rem; }
.badge-no-stems { background: #2d374840; color: var(--muted); border-radius: 3px; padding: 1px 7px; font-size: .72rem; }
.browse-actions { display: flex; gap: 5px; flex-shrink: 0; }

/* ── REC 오버레이 ─────────────────────────────── */
.rec-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.rec-timer {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: .1em;
  color: var(--danger);
  font-variant-numeric: tabular-nums;
}

#recLevel {
  width: 100%;
  border-radius: 4px;
  background: #080b10;
  border: 1px solid var(--line);
}

.rec-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.rec-download {
  border: 1px solid var(--line);
  background: linear-gradient(#1b212b, #10141a);
  color: var(--text);
  border-radius: 4px;
  padding: 7px 12px;
  text-decoration: none;
  font-size: .88rem;
}

/* ── FX 오버레이 ─────────────────────────────── */
.fx-overlay-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.fx-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fx-col label {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: .82rem;
}

.fx-divider {
  border: none;
  border-top: 1px solid var(--line);
  margin: 4px 0;
}
```

- [ ] **Step 2: 브라우저에서 탭 레이아웃 확인**

서버 실행 후 `http://127.0.0.1:8765` 접속. 탭 버튼이 모두 활성화(클릭 가능)되어 있는지 확인. 클릭해도 JS가 없어서 화면 전환은 안 됨 — 다음 Task에서 처리.

- [ ] **Step 3: 커밋**

```bash
git add static/styles.css
git commit -m "feat: add tab, overlay, library, browse, rec, fx CSS styles"
```

---

## Task 4: JS — 탭 전환 인프라 + BPM 캐시

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: BPM 캐시 함수 추가**

`app.js` 파일 상단의 전역 변수 선언부(`let lastClockAt = 0;` 바로 뒤)에 추가:

```js
function getBpmCache(tid) {
  if (!tid) return null;
  const v = localStorage.getItem(`stemDJ_bpm_${tid}`);
  return v ? Number(v) : null;
}

function setBpmCache(tid, bpm) {
  if (tid && bpm) localStorage.setItem(`stemDJ_bpm_${tid}`, String(bpm));
}
```

- [ ] **Step 2: Deck.analyze() 에서 BPM 캐시 저장**

`Deck.analyze()` 내부 (389줄 근처) `$('bpm...')` 업데이트 직후에 추가:

```js
      this.bpm = estimateBpm(audio);
      $(`bpm${this.id}`).textContent = this.bpm ? `BPM ${this.bpm}` : "BPM --";
      if (this.track?.id && this.bpm) setBpmCache(this.track.id, this.bpm); // ← 추가
```

- [ ] **Step 3: refreshLibrary() 에서 BPM 캐시 병합**

`refreshLibrary()` 내부 `libraryTracks = data.tracks;` 줄 바로 뒤에 추가:

```js
  libraryTracks = data.tracks;
  libraryTracks.forEach(t => { if (!t.bpm) t.bpm = getBpmCache(t.id); }); // ← 추가
```

- [ ] **Step 4: 탭 전환 함수 추가**

`app.js` 의 `const decks = ...` 선언(724줄) 바로 앞에 삽입:

```js
const OVERLAY_TABS = new Set(["REC", "FX"]);

function activateTab(name) {
  if (OVERLAY_TABS.has(name)) {
    toggleOverlay(name);
    return;
  }
  document.getElementById("performView").hidden = name !== "PERFORM";
  document.getElementById("libraryView").hidden = name !== "LIBRARY";
  document.getElementById("browseView").hidden = name !== "BROWSE";
  document.querySelectorAll(".nav-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  if (name === "LIBRARY") renderLibraryTab();
  if (name === "BROWSE") renderBrowseTab();
}

function toggleOverlay(name) {
  const id = name === "REC" ? "recOverlay" : "fxOverlay";
  const el = document.getElementById(id);
  el.hidden = !el.hidden;
  if (!el.hidden && name === "FX") syncFxOverlaySliders();
}

function syncFxOverlaySliders() {
  ["A", "B"].forEach((id) => {
    ["Filter", "Echo", "Reverb"].forEach((fx) => {
      const overlay = $(`fx${fx}${id}`);
      const util = $(`${fx.toLowerCase()}${id}`);
      if (overlay && util) overlay.value = util.value;
    });
  });
}
```

- [ ] **Step 5: nav 탭 버튼 이벤트 연결**

`bindGlobalControls()` 함수 맨 앞에 추가:

```js
function bindGlobalControls() {
  document.querySelectorAll(".nav-tabs button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
  // ↓ 기존 코드 계속 ...
  $("refreshLibrary").addEventListener("click", refreshLibrary);
  ...
```

- [ ] **Step 6: overlay-close 버튼 연결**

`bindGlobalControls()` 내부 nav 탭 이벤트 바로 뒤에 추가:

```js
  document.querySelectorAll(".overlay-close[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.close).hidden = true;
    });
  });
```

- [ ] **Step 7: 브라우저 동작 확인**

서버 실행 후 `http://127.0.0.1:8765`:
- LIBRARY 클릭 → 빈 library-view 표시, PERFORM 화면 숨김
- BROWSE 클릭 → 빈 browse-view 표시
- PERFORM 클릭 → DJ 화면 복귀
- REC 클릭 → rec-overlay 팝업, 재클릭 시 닫힘
- FX 클릭 → fx-overlay 팝업

콘솔에서 확인:
```js
activateTab('LIBRARY');
console.assert(!document.getElementById('performView').hidden === false);
console.assert(document.getElementById('libraryView').hidden === false);
```

- [ ] **Step 8: 커밋**

```bash
git add static/app.js
git commit -m "feat: tab switching infrastructure and BPM localStorage cache"
```

---

## Task 5: JS — LIBRARY 탭 렌더링

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: renderLibraryTab 함수 추가**

`activateTab` 함수 바로 뒤에 삽입:

```js
function renderLibraryTab() {
  const q = ($("libSearch")?.value || "").trim().toLowerCase();
  const filter = $("libFilter")?.value || "all";
  const sort = $("libSort")?.value || "title";

  let tracks = libraryTracks.filter((t) => {
    const matchQ = !q || t.title.toLowerCase().includes(q) || t.filename.toLowerCase().includes(q);
    const matchF =
      filter === "all" ||
      (filter === "stems" && t.stemReady) ||
      (filter === "nostems" && !t.stemReady);
    return matchQ && matchF;
  });

  tracks = [...tracks].sort((a, b) => {
    if (sort === "bpm") return (a.bpm ?? 9999) - (b.bpm ?? 9999);
    if (sort === "size") return (b.size ?? 0) - (a.size ?? 0);
    if (sort === "modified") return (b.modified ?? 0) - (a.modified ?? 0);
    return a.title.localeCompare(b.title);
  });

  const rows = $("libRows");
  rows.innerHTML = "";

  tracks.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "lib-row" + (selectedTrack?.id === track.id ? " selected" : "");

    const cells = [
      { text: String(i + 1), tag: "span" },
      { text: track.title, tag: "strong" },
      { text: track.filename, tag: "span" },
      { text: track.bpm ?? "—", tag: "span", cls: track.bpm ? "bpm-val" : "bpm-na" },
      { text: track.size ? `${Math.round(track.size / 1024 / 1024)} MB` : "local", tag: "span" },
      { text: track.stemReady ? "✓" : "—", tag: "span", cls: track.stemReady ? "stems-ready" : "" },
    ];

    cells.forEach(({ text, tag, cls }) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (cls) el.className = cls;
      row.appendChild(el);
    });

    const actions = document.createElement("div");
    actions.className = "lib-actions";
    ["A", "B"].forEach((deckId) => {
      const btn = document.createElement("button");
      btn.textContent = deckId;
      btn.className = `load-btn load-btn-${deckId.toLowerCase()}`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedTrack = track;
        decks[deckId].loadMix(track).catch((err) => log(`Deck ${deckId} 로드 실패: ${err.message}`));
        renderTracks();
        renderSelectedPreview();
      });
      actions.appendChild(btn);
    });
    row.appendChild(actions);

    row.addEventListener("click", () => {
      selectedTrack = track;
      renderTracks();
      renderSelectedPreview();
      rows.querySelectorAll(".lib-row").forEach((r) => r.classList.remove("selected"));
      row.classList.add("selected");
    });

    rows.appendChild(row);
  });

  const status = $("libStatus");
  if (status) status.textContent = `${tracks.length}개 트랙 · ${$("libraryPath").textContent}`;
}
```

- [ ] **Step 2: LIBRARY 탭 컨트롤 이벤트 연결**

`bindGlobalControls()` 내부, `$("search").addEventListener` 줄 근처에 추가:

```js
  // LIBRARY 탭 컨트롤
  $("libSearch")?.addEventListener("input", renderLibraryTab);
  $("libFilter")?.addEventListener("change", renderLibraryTab);
  $("libSort")?.addEventListener("change", renderLibraryTab);
  $("libRefresh")?.addEventListener("click", () => refreshLibrary().then(renderLibraryTab));
```

- [ ] **Step 3: 동작 확인**

서버 실행 후 LIBRARY 탭 클릭:
- 트랙 목록이 표시되는지 확인
- BPM 열: 이미 분석된 곡은 숫자, 미분석은 `—`
- Sort: BPM 클릭 시 BPM 있는 곡이 위로 정렬
- Load A 버튼 클릭 시 Deck A에 곡 로드 후 PERFORM 탭 이동 없이 현재 뷰 유지

- [ ] **Step 4: 커밋**

```bash
git add static/app.js
git commit -m "feat: LIBRARY tab render with sort, filter, BPM column, load A/B"
```

---

## Task 6: JS — BROWSE 탭 렌더링

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: renderBrowseTab 함수 추가**

`renderLibraryTab` 함수 바로 뒤에 삽입:

```js
function renderBrowseTab() {
  const bpmMin = Number($("bpmMin")?.value ?? 40);
  const bpmMax = Number($("bpmMax")?.value ?? 220);
  const stemsReady = $("fStemsReady")?.checked ?? true;
  const stemsNo = $("fStemsNo")?.checked ?? true;
  const extChecks = ["mp3", "wav", "flac", "m4a"];
  const exts = extChecks.filter((e) => $(`fExt_${e}`)?.checked ?? true);

  const results = libraryTracks.filter((t) => {
    const bpm = t.bpm;
    const bpmOk = !bpm || (bpm >= bpmMin && bpm <= bpmMax);
    const stemsOk = (stemsReady && t.stemReady) || (stemsNo && !t.stemReady);
    const ext = t.filename.split(".").pop().toLowerCase();
    const extOk = exts.length === 0 || exts.includes(ext);
    return bpmOk && stemsOk && extOk;
  });

  const count = $("browseCount");
  if (count) count.textContent = `${results.length}개 결과`;

  const container = $("browseRows");
  container.innerHTML = "";

  results.forEach((track) => {
    const row = document.createElement("div");
    row.className = "browse-row";

    const info = document.createElement("div");
    info.className = "browse-info";

    const title = document.createElement("strong");
    title.textContent = track.title;

    const meta = document.createElement("span");
    meta.className = "browse-meta";
    const ext = track.filename.split(".").pop().toLowerCase();
    const sizeStr = track.size ? `${Math.round(track.size / 1024 / 1024)} MB` : "local";
    meta.textContent = [track.bpm ? `${track.bpm} BPM` : null, ext, sizeStr].filter(Boolean).join(" · ");

    const badge = document.createElement("span");
    badge.className = track.stemReady ? "badge-stems" : "badge-no-stems";
    badge.textContent = track.stemReady ? "stems ✓" : "no stems";

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(badge);

    const actions = document.createElement("div");
    actions.className = "browse-actions";
    ["A", "B"].forEach((deckId) => {
      const btn = document.createElement("button");
      btn.textContent = deckId;
      btn.className = `load-btn load-btn-${deckId.toLowerCase()}`;
      btn.addEventListener("click", () => {
        selectedTrack = track;
        decks[deckId].loadMix(track).catch((err) => log(`Deck ${deckId} 로드 실패: ${err.message}`));
      });
      actions.appendChild(btn);
    });

    row.appendChild(info);
    row.appendChild(actions);
    container.appendChild(row);
  });
}
```

- [ ] **Step 2: BROWSE 탭 컨트롤 이벤트 연결**

`bindGlobalControls()` 내부, LIBRARY 컨트롤 이벤트 바로 뒤에 추가:

```js
  // BROWSE 탭 컨트롤
  $("browseApply")?.addEventListener("click", renderBrowseTab);
  $("browseReset")?.addEventListener("click", () => {
    $("bpmMin").value = 60;
    $("bpmMax").value = 200;
    ["fStemsReady", "fStemsNo"].forEach((id) => { $( id).checked = true; });
    ["mp3", "wav", "flac", "m4a"].forEach((e) => { $(`fExt_${e}`).checked = true; });
    renderBrowseTab();
  });
```

- [ ] **Step 3: 동작 확인**

BROWSE 탭에서:
- BPM 범위를 `120–140`으로 설정 후 Apply → 해당 BPM 트랙만 표시
- Reset → 전체 목록 복귀
- flac 체크 해제 후 Apply → flac 파일 제외

- [ ] **Step 4: 커밋**

```bash
git add static/app.js
git commit -m "feat: BROWSE tab with BPM/stems/ext filter"
```

---

## Task 7: JS — REC 오버레이

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: REC 오버레이 상태 변수 추가**

전역 변수 선언부에 추가:

```js
let recTimerInterval = null;
let recStartTime = null;
let recLevelRaf = null;
let recAnalyser = null;
```

- [ ] **Step 2: REC 오버레이 헬퍼 함수 추가**

`setupRecording()` 함수 바로 앞에 삽입:

```js
function startRecTimer() {
  recStartTime = Date.now();
  clearInterval(recTimerInterval);
  recTimerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - recStartTime) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    const el = $("recTimer");
    if (el) el.textContent = `${h}:${m}:${sec}`;
  }, 1000);
}

function stopRecTimer() {
  clearInterval(recTimerInterval);
  const el = $("recTimer");
  if (el) el.textContent = "00:00:00";
}

function startLevelMeter() {
  if (!audioCtx || !masterGain) return;
  if (!recAnalyser) {
    recAnalyser = audioCtx.createAnalyser();
    recAnalyser.fftSize = 256;
    masterGain.connect(recAnalyser);
  }
  const canvas = $("recLevel");
  if (!canvas) return;
  const ctx2d = canvas.getContext("2d");
  const buf = new Float32Array(recAnalyser.frequencyBinCount);

  function frame() {
    recAnalyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const w = canvas.width;
    const h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#080b10";
    ctx2d.fillRect(0, 0, w, h);
    const barW = Math.min(w, Math.round(rms * w * 8));
    if (barW > 0) {
      const grad = ctx2d.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#31c4a8");
      grad.addColorStop(0.65, "#e0bc5b");
      grad.addColorStop(1, "#ff5757");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 4, barW, h - 8);
    }
    recLevelRaf = requestAnimationFrame(frame);
  }
  frame();
}

function stopLevelMeter() {
  cancelAnimationFrame(recLevelRaf);
  recLevelRaf = null;
}
```

- [ ] **Step 3: setupRecording() 수정**

기존 `setupRecording()` 함수 전체를 다음으로 교체:

```js
function setupRecording() {
  function handleToggle() {
    // topbar 버튼 텍스트 동기화
    const isRec = mediaRecorder?.state === "recording";
    $("recToggle").textContent = isRec ? "Stop" : "Record";
  }

  async function doRecord() {
    await ensureAudio();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      $("recordBtn").textContent = "Record";
      $("recToggle").textContent = "Record";
      stopRecTimer();
      stopLevelMeter();
      return;
    }
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(recorderDestination.stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      // topbar 링크
      const topLink = $("downloadMix");
      topLink.href = url;
      topLink.download = `stem-dj-mix-${Date.now()}.webm`;
      topLink.hidden = false;
      topLink.textContent = "Download mix";
      // REC 오버레이 링크
      const recLink = $("recDownload");
      if (recLink) {
        recLink.href = url;
        recLink.download = topLink.download;
        recLink.hidden = false;
        recLink.textContent = "Download .webm";
      }
      log("녹음 완료");
    };
    mediaRecorder.start();
    $("recordBtn").textContent = "Stop";
    $("recToggle").textContent = "Stop";
    startRecTimer();
    startLevelMeter();
    log("녹음 시작");
  }

  $("recordBtn").addEventListener("click", doRecord);
  $("recToggle").addEventListener("click", doRecord);
}
```

- [ ] **Step 4: 동작 확인**

REC 탭 클릭 → 오버레이 표시. Record 버튼 클릭 → 타이머 시작, 레벨 바 동작, topbar "Stop" 변경. Stop 클릭 → 타이머 리셋, Download 링크 표시.

- [ ] **Step 5: 커밋**

```bash
git add static/app.js
git commit -m "feat: REC overlay with timer, level meter, topbar sync"
```

---

## Task 8: JS + 새 파일 — FX 오버레이 + Flanger/Phaser

**Files:**
- Modify: `static/app.js`
- Create: `static/bitcrusher-processor.js`

- [ ] **Step 1: FlangerNode 클래스 추가**

`app.js` 의 `class Deck` 선언 바로 앞에 삽입:

```js
class FlangerNode {
  constructor(ctx) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const delay = ctx.createDelay(0.02);
    delay.delayTime.value = 0.005;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.25;
    lfoGain.gain.value = 0.003;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    this.input.connect(delay);
    delay.connect(this.wet);
    this.wet.connect(this.output);
    this.input.connect(this.output);
    lfo.start();
  }
  setWet(v) { this.wet.gain.value = Math.max(0, Math.min(1, v)); }
}

class PhaserNode {
  constructor(ctx) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    const allpasses = [200, 400, 800, 1600].map((freq) => {
      const f = ctx.createBiquadFilter();
      f.type = "allpass";
      f.frequency.value = freq;
      f.Q.value = 0.5;
      return f;
    });
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.3;
    lfoGain.gain.value = 800;
    lfo.connect(lfoGain);
    allpasses.forEach((f) => lfoGain.connect(f.frequency));
    this.input.connect(allpasses[0]);
    for (let i = 0; i < 3; i++) allpasses[i].connect(allpasses[i + 1]);
    allpasses[3].connect(this.wet);
    this.wet.connect(this.output);
    this.input.connect(this.output);
    lfo.start();
  }
  setWet(v) { this.wet.gain.value = Math.max(0, Math.min(1, v)); }
}
```

- [ ] **Step 2: bitcrusher 모듈 상태 전역 변수 추가**

전역 변수 선언부에 추가:

```js
let bitcrusherModuleLoaded = false;
```

- [ ] **Step 3: Deck.initGraph() 수정 — 새 FX 체인 삽입**

`initGraph()` 내부의 `this.deckGain.connect(masterGain);` 줄 바로 앞에 기존 코드가 다음과 같이 되어 있음:

```js
    this.filter.connect(this.deckGain);
    this.filter.connect(this.delay);
    ...
    this.deckGain.connect(masterGain);
```

`this.filter.connect(this.deckGain);` 줄을 삭제하고 `this.deckGain.connect(masterGain);` 앞에 다음을 삽입:

```js
    // 새 FX 체인: filter → flanger → phaser → bitcrusher → deckGain
    this.flanger = new FlangerNode(audioCtx);
    this.phaser = new PhaserNode(audioCtx);
    // Bitcrusher: AudioWorklet 시도, 실패 시 passthrough GainNode
    this.bitcrusherReady = false;
    try {
      if (!bitcrusherModuleLoaded) {
        await audioCtx.audioWorklet.addModule("/bitcrusher-processor.js");
        bitcrusherModuleLoaded = true;
      }
      this.bitcrusher = new AudioWorkletNode(audioCtx, "bitcrusher");
      this.bitcrusherReady = true;
    } catch {
      this.bitcrusher = audioCtx.createGain();
    }
    this.filter.connect(this.flanger.input);
    this.flanger.output.connect(this.phaser.input);
    this.phaser.output.connect(this.bitcrusher);
    this.bitcrusher.connect(this.deckGain);
```

Note: `initGraph()` 는 이미 `async` 함수이므로 `await` 사용 가능.

- [ ] **Step 4: Bitcrusher AudioWorkletProcessor 파일 생성**

`static/bitcrusher-processor.js` 신규 생성:

```js
class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "bits", defaultValue: 16, minValue: 1, maxValue: 16 },
      { name: "wet", defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp || !inp.length) return true;
    const bitsArr = parameters.bits;
    const wetArr = parameters.wet;
    for (let ch = 0; ch < Math.min(inp.length, out.length); ch++) {
      const src = inp[ch];
      const dst = out[ch];
      for (let i = 0; i < src.length; i++) {
        const bits = bitsArr.length > 1 ? bitsArr[i] : bitsArr[0];
        const wet = wetArr.length > 1 ? wetArr[i] : wetArr[0];
        const step = Math.pow(2, -(bits - 1));
        const crushed = Math.round(src[i] / step) * step;
        dst[i] = src[i] * (1 - wet) + crushed * wet;
      }
    }
    return true;
  }
}

registerProcessor("bitcrusher", BitcrusherProcessor);
```

- [ ] **Step 5: FX 오버레이 슬라이더 바인딩 함수 추가**

`bindGlobalControls()` 함수 바로 앞에 삽입:

```js
function bindFxOverlayControls() {
  ["A", "B"].forEach((id) => {
    // 기존 Filter/Echo/Reverb: utility row 슬라이더와 양방향 동기
    [["Filter", "filter"], ["Echo", "echo"], ["Reverb", "reverb"]].forEach(([label, utilId]) => {
      const overlay = $(`fx${label}${id}`);
      const util = $(`${utilId}${id}`);
      if (!overlay || !util) return;
      overlay.addEventListener("input", () => {
        util.value = overlay.value;
        util.dispatchEvent(new Event("input")); // 기존 핸들러 실행
      });
    });

    // 새 이펙터
    $(`fxFlanger${id}`)?.addEventListener("input", (e) => {
      decks[id]?.flanger?.setWet(Number(e.target.value) / 100);
    });
    $(`fxPhaser${id}`)?.addEventListener("input", (e) => {
      decks[id]?.phaser?.setWet(Number(e.target.value) / 100);
    });
    $(`fxBitcrush${id}`)?.addEventListener("input", (e) => {
      const deck = decks[id];
      if (!deck?.bitcrusherReady) return;
      const v = Number(e.target.value) / 100;
      deck.bitcrusher.parameters.get("wet").value = v;
      deck.bitcrusher.parameters.get("bits").value = Math.max(1, Math.round(16 - v * 12));
    });
  });
}
```

- [ ] **Step 6: bindFxOverlayControls() 호출**

`bindGlobalControls()` 함수 내부 맨 끝(return 전)에 추가:

```js
  bindFxOverlayControls();
```

- [ ] **Step 7: 동작 확인**

곡을 덱에 로드 후 재생. FX 탭 오픈:
- Filter/Echo/Reverb 슬라이더 조작 시 PERFORM 탭 utility row 슬라이더도 같은 값으로 이동하는지 확인
- Flanger 슬라이더를 50%까지 올리면 특유의 flanging 사운드가 들리는지 확인
- Phaser 슬라이더 올리면 위상 이동 효과 확인
- Bitcrush 슬라이더 올리면 비트 수가 줄어드는 크런치 사운드 확인

브라우저 콘솔에서 AudioWorklet 로드 확인:
```js
console.log(decks.A.bitcrusherReady); // true이면 AudioWorklet, false이면 fallback
```

- [ ] **Step 8: 커밋**

```bash
git add static/app.js static/bitcrusher-processor.js
git commit -m "feat: FX overlay with Flanger, Phaser, Bitcrusher AudioWorklet"
```

---

## Task 9: JS — XSS 수정 + ObjectURL 누수 해제

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: renderTracks() innerHTML 제거**

기존 `renderTracks()` 내부 `row.innerHTML = ...` 블록(745–750줄)을 다음으로 교체:

```js
    const size = track.size ? `${Math.round(track.size / 1024 / 1024)} MB` : "local";

    const titleEl = document.createElement("strong");
    titleEl.textContent = track.title;

    const fnameEl = document.createElement("span");
    fnameEl.textContent = track.filename;

    const stemsEl = document.createElement("span");
    stemsEl.textContent = track.stemReady ? "stems ready" : "original";

    const sizeEl = document.createElement("span");
    sizeEl.textContent = size;

    row.appendChild(titleEl);
    row.appendChild(fnameEl);
    row.appendChild(stemsEl);
    row.appendChild(sizeEl);
```

- [ ] **Step 2: renderSelectedPreview() innerHTML 제거**

기존 `renderSelectedPreview()` 내부 `box.innerHTML = ...` 블록(767–770줄)을 다음으로 교체:

```js
  box.innerHTML = "";
  const titleEl = document.createElement("strong");
  titleEl.textContent = selectedTrack.title;
  const fnameEl = document.createElement("span");
  fnameEl.textContent = selectedTrack.filename;
  const stemsEl = document.createElement("span");
  stemsEl.textContent = selectedTrack.stemReady ? "Stem cache ready" : "Original track";
  [titleEl, document.createElement("br"), fnameEl, document.createElement("br"), stemsEl]
    .forEach((el) => box.appendChild(el));
```

- [ ] **Step 3: localFileTrack ObjectURL 추적 변수 추가**

전역 변수 선언부에 추가:

```js
const localObjectUrls = [];
```

- [ ] **Step 4: localFileTrack 에서 URL 추적**

`localFileTrack` 함수를 다음으로 교체:

```js
function localFileTrack(file) {
  const url = URL.createObjectURL(file);
  localObjectUrls.push(url);
  return {
    id: null,
    title: file.name.replace(/\.[^.]+$/, ""),
    filename: file.name,
    url,
  };
}
```

- [ ] **Step 5: 녹음 완료 ObjectURL 관리**

`setupRecording()` 의 `mediaRecorder.onstop` 내부에서, 새 URL 생성 전에 기존 녹음 URL을 해제:

```js
    mediaRecorder.onstop = () => {
      // 기존 녹음 URL 해제
      const topLink = $("downloadMix");
      if (topLink.href && topLink.href.startsWith("blob:")) {
        URL.revokeObjectURL(topLink.href);
      }
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      ...
```

- [ ] **Step 6: 동작 확인**

브라우저 DevTools → Memory 탭에서 스냅샷 비교 (선택 사항).  
최소한 콘솔에서 특수문자 파일명 테스트:

```js
// 콘솔에서 직접 주입 테스트
libraryTracks.push({ id: 'test', title: '<img src=x onerror=alert(1)>', filename: 'test.mp3', stemReady: false, size: 0 });
renderTracks();
// 트랙 목록에 alert가 뜨지 않고 텍스트로 표시되어야 함
libraryTracks.pop();
renderTracks();
```

Expected: `<img src=x onerror=alert(1)>` 텍스트 그대로 표시, alert 없음.

- [ ] **Step 7: 커밋**

```bash
git add static/app.js
git commit -m "fix: replace innerHTML with textContent to prevent XSS, revoke ObjectURLs"
```

---

## 완료 확인 체크리스트

- [ ] `http://127.0.0.1:8765` 접속 후 전체 탭 순서 동작 확인
- [ ] LIBRARY: 트랙 목록, BPM 컬럼, Sort, Filter, Load A/B
- [ ] BROWSE: BPM 범위·stems·확장자 필터 Apply/Reset
- [ ] REC: 타이머 시작·중지, 레벨 바, Download 링크
- [ ] FX: Flanger·Phaser·Bitcrush 사운드 변화, utility row 슬라이더 동기화
- [ ] 특수문자 파일명 XSS 테스트 통과
- [ ] 서버 재시작 후 `translate_path('/../etc/passwd')` 차단 확인
