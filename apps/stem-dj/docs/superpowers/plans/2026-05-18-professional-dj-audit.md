# Professional DJ Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Stem DJ Lab as a practical 2-deck DJ tool and apply small, high-confidence improvements that help a professional DJ prepare tracks, mix, use FX, record, and understand stem-split status.

**Architecture:** Keep the existing Python stdlib server and Vanilla JS/Web Audio architecture. Avoid large rewrites; improve observability, status feedback, and regression coverage around existing tab, deck, FX, REC, and stem flows. Use browser verification for UI behavior and small Python/static checks for repeatable safety checks.

**Tech Stack:** Python 3 stdlib HTTP server, Vanilla JavaScript, Web Audio API, AudioWorklet, HTML5, CSS3, PowerShell launch scripts.

---

## File Structure

| File | Responsibility | Planned Change |
|---|---|---|
| `server.py` | Local HTTP server, library scan, media streaming, stem job API | Add lightweight self-check helpers only if browser/server validation reveals a server-side defect. Do not restructure. |
| `static/index.html` | App layout and tab/overlay DOM | Small label/status additions only if needed after browser audit. |
| `static/app.js` | Deck logic, audio graph, tabs, library, browse, FX, REC | Primary target for professional DJ workflow feedback improvements. |
| `static/styles.css` | Visual layout and status readability | Small CSS improvements for visible state, not a redesign. |
| `static/bitcrusher-processor.js` | AudioWorklet processor | Validate loading and keep unchanged unless a real browser error appears. |
| `docs/superpowers/specs/2026-05-18-professional-dj-audit-design.md` | Approved design | No implementation change. |
| `docs/superpowers/plans/2026-05-18-professional-dj-audit.md` | This implementation plan | Track execution. |

---

## Task 1: Establish Baseline and Start Server

**Files:**
- Read only: `README.md`
- Read only: `server.py`
- Read only: `static/index.html`
- Read only: `static/app.js`
- Read only: `static/styles.css`

- [ ] **Step 1: Confirm working tree context**

Run:

```bash
git -C "C:/Users/<사용자>/workspace/apps/stem-dj" status --short
```

Expected:

- Existing unrelated parent-repository noise may appear because this folder is inside a larger working tree.
- Do not delete, restore, or clean any file.
- Note changes under `workspace/apps/stem-dj` only.

- [ ] **Step 2: Run Python syntax check**

Run:

```bash
python -m py_compile "C:/Users/<사용자>/workspace/apps/stem-dj/server.py"
```

Expected:

- Exit code `0`.
- No output.

- [ ] **Step 3: Run JavaScript parse check**

Run:

```bash
node --check "C:/Users/<사용자>/workspace/apps/stem-dj/static/app.js"
node --check "C:/Users/<사용자>/workspace/apps/stem-dj/static/bitcrusher-processor.js"
```

Expected:

- Both commands exit `0`.
- Output includes no syntax errors.

If `node` is not installed, record that parse check is skipped and rely on browser console verification in Task 2.

- [ ] **Step 4: Start the app server**

Run:

```bash
python "C:/Users/<사용자>/workspace/apps/stem-dj/server.py"
```

Expected:

```text
Stem DJ running at http://127.0.0.1:8765
```

Keep this process running while completing browser checks. If the port is already in use, identify the existing process and use the already-running app instead of killing anything without user approval.

---

## Task 2: Browser Audit as a Professional DJ

**Files:**
- Read only unless defects are found: `static/index.html`
- Read only unless defects are found: `static/app.js`
- Read only unless defects are found: `static/styles.css`

- [ ] **Step 1: Open the app in a browser**

Open:

```text
http://127.0.0.1:8765
```

Expected:

- Header with `STEMWAVE` brand.
- PERFORM tab active.
- Deck A and Deck B visible.
- Library area visible.
- No blocking browser console error on initial load.

- [ ] **Step 2: Check professional DJ track-prep flow**

In the browser:

1. Click `Refresh`.
2. Type a short query in the main search box.
3. Select a track if tracks exist.
4. Click `Load selected` on Deck A.
5. Click `Load selected` on Deck B.

Expected:

- Library list updates after refresh.
- Search narrows the list without breaking layout.
- Selected track panel updates.
- Deck title changes after loading.
- If there are no usable tracks, the app shows clear status and does not throw console errors.

- [ ] **Step 3: Check LIBRARY tab flow**

In the browser:

1. Click `LIBRARY`.
2. Use `Search`.
3. Change filter to `Stems Ready`.
4. Change filter to `No Stems`.
5. Change sort to `BPM`, `Size`, and `Date`.
6. Click row buttons `A` and `B` if rows exist.

Expected:

- LIBRARY tab opens without pausing or resetting audio state.
- Table rows remain readable.
- Filter/sort changes do not create console errors.
- Row `A`/`B` buttons load the target deck.

- [ ] **Step 4: Check BROWSE tab flow**

In the browser:

1. Click `BROWSE`.
2. Set BPM min and max.
3. Toggle `Ready` and `Not split`.
4. Toggle file-type checkboxes.
5. Click `Apply`.
6. Click `Reset`.

Expected:

- Results count updates.
- Reset restores broad results.
- BPM-unanalyzed tracks are handled gracefully.
- No console errors.

- [ ] **Step 5: Check deck transport and mix controls**

In the browser with a loaded deck if possible:

1. Click `Play` then `Pause`.
2. Move `Tempo` on Deck A and Deck B.
3. Press loop buttons `1/2`, `1`, `4`, `8`, `Loop off`.
4. Move `Crossfader`.
5. Move `Master`.
6. Click `Sync B to A`.

Expected:

- Button labels match state.
- Loop readout changes per deck.
- Tempo readout changes immediately.
- Sync produces useful status if sync cannot be applied.
- No console errors.

- [ ] **Step 6: Check FX workflow**

In the browser:

1. In center mixer, switch `MIXER`, `FX`, `FILTER`.
2. Move Filter/Echo/Reverb sliders.
3. Click top `FX` tab.
4. Move Filter/Echo/Reverb sliders in overlay.
5. Move Flanger/Phaser/Bitcrusher sliders.
6. Close overlay.

Expected:

- Center mixer tabs switch cleanly.
- FX overlay opens above PERFORM without destroying deck state.
- Shared Filter/Echo/Reverb sliders stay synchronized.
- Additional FX sliders do not throw errors if no deck is loaded.

- [ ] **Step 7: Check REC workflow**

In the browser:

1. Click `REC` tab.
2. Click `Record`.
3. Wait at least 3 seconds.
4. Click `Stop`.
5. Confirm download link appears.

Expected:

- Topbar and REC overlay record buttons stay synchronized.
- Timer increments while recording.
- Level meter does not break layout.
- Download link appears after stop.

- [ ] **Step 8: Check Stem Split feedback**

In the browser:

1. Load a track if possible.
2. Click `Stem Split`.

Expected:

- If Demucs is available, status indicates queued/running/done or error.
- If Demucs is unavailable, status clearly explains that playback still works and stem split requires Demucs.
- Repeated clicks do not create confusing duplicate state.

- [ ] **Step 9: Record audit findings**

Create a short finding list in the conversation or working notes using this exact structure:

```markdown
## 필수 수정
- [file/path:line] 문제 — 영향 — 확인 방법

## 권장 개선
- [file/path:line] 개선 — 이유 — 확인 방법

## 장기 기능
- 기능 — 전문 DJ 관점의 가치 — 별도 설계 필요 이유
```

Do not implement long-term features in this plan.

---

## Task 3: Apply Small Professional-Workflow Fixes

**Files:**
- Modify as needed: `static/app.js`
- Modify as needed: `static/index.html`
- Modify as needed: `static/styles.css`

Only perform this task if Task 2 finds a concrete defect or small workflow issue. Use the following approved fix patterns.

- [ ] **Step 1: Improve impossible-operation feedback**

If a deck operation silently fails when no track is loaded, update the relevant handler in `static/app.js` to call `log()` with a user-action message.

Example pattern:

```js
if (!this.track) {
  log(`Deck ${this.id}: 먼저 트랙을 로드하세요.`);
  return;
}
```

Expected:

- No alert boxes.
- No console-only feedback.
- Status log tells the DJ what to do next.

- [ ] **Step 2: Improve Sync feedback**

If `Sync B to A` can be clicked when Deck A/B is not ready, update the click handler in `static/app.js` so it checks prerequisites before applying tempo.

Use this behavior:

```js
if (!deckA.track || !deckB.track) {
  log("Sync requires tracks loaded on both Deck A and Deck B.");
  return;
}
if (!deckA.bpm || !deckB.bpm) {
  log("Sync requires BPM analysis on both decks. Play or load tracks and wait for BPM detection.");
  return;
}
```

Expected:

- Sync does not silently do nothing.
- DJ understands why sync is unavailable.

- [ ] **Step 3: Improve Stem Split duplicate-click feedback**

If repeated `Stem Split` clicks start duplicate jobs or duplicate polling, add a per-deck guard in `static/app.js`.

Add a property in `Deck` constructor:

```js
this.stemJobRunning = false;
```

Wrap `splitStems(deck)` with:

```js
if (deck.stemJobRunning) {
  log(`Deck ${deck.id}: stem split is already running.`);
  return;
}
deck.stemJobRunning = true;
try {
  // existing splitStems body
} finally {
  deck.stemJobRunning = false;
}
```

If the existing function returns before polling finishes, move `deck.stemJobRunning = false` to the `done` and `error` branches inside `pollStemJob(deck, job)`.

Expected:

- Repeated clicks produce one clear status message.
- No duplicate job spam.

- [ ] **Step 4: Improve visible active/loaded track feedback**

If the browser audit shows the DJ cannot distinguish selected track from loaded decks, add non-invasive text feedback in `static/app.js` using existing `log()` and existing title fields.

Use this behavior after a successful load:

```js
log(`Deck ${this.id} loaded: ${track.title}`);
```

Expected:

- Status log confirms which deck received which track.
- No large layout changes.

- [ ] **Step 5: Improve REC availability feedback**

If REC download state is unclear, update `static/app.js` so the REC overlay download link text is reset when recording starts and updated after recording stops.

On recording start:

```js
const recLink = $("recDownload");
if (recLink) {
  recLink.hidden = true;
  recLink.removeAttribute("href");
  recLink.textContent = "Download .webm";
}
```

After `MediaRecorder` stop creates the blob URL:

```js
const recLink = $("recDownload");
if (recLink) {
  recLink.href = url;
  recLink.download = `stem-dj-mix-${Date.now()}.webm`;
  recLink.textContent = "Download .webm";
  recLink.hidden = false;
}
```

Expected:

- DJ sees a download only when a recording exists.

- [ ] **Step 6: Run syntax checks after edits**

Run:

```bash
python -m py_compile "C:/Users/<사용자>/workspace/apps/stem-dj/server.py"
node --check "C:/Users/<사용자>/workspace/apps/stem-dj/static/app.js"
node --check "C:/Users/<사용자>/workspace/apps/stem-dj/static/bitcrusher-processor.js"
```

Expected:

- Python check exits `0`.
- Node checks exit `0`, unless `node` is unavailable.

---

## Task 4: Browser Regression Verification

**Files:**
- Verify: `static/index.html`
- Verify: `static/app.js`
- Verify: `static/styles.css`

- [ ] **Step 1: Restart or refresh the app**

If the server is still running, hard-refresh the browser.

If the server stopped, run:

```bash
python "C:/Users/<사용자>/workspace/apps/stem-dj/server.py"
```

Expected:

```text
Stem DJ running at http://127.0.0.1:8765
```

- [ ] **Step 2: Re-run critical DJ flow**

In browser:

1. Open PERFORM.
2. Refresh library.
3. Load a track to Deck A if available.
4. Load a track to Deck B if available.
5. Open LIBRARY and BROWSE.
6. Open FX overlay and move one slider.
7. Open REC, start, wait 3 seconds, stop.

Expected:

- No new console errors.
- No visible broken layout.
- Any fixed feedback appears in the status log or visible UI.

- [ ] **Step 3: Re-test no-track safe operations**

If no tracks are available, use that state to test safe feedback:

1. Click `Load selected` with no selected track.
2. Click `Sync B to A`.
3. Click `Stem Split` on an empty deck.
4. Open FX overlay and move sliders.

Expected:

- App does not crash.
- Status log gives user-action feedback where applicable.

---

## Task 5: Final Report

**Files:**
- Read: `docs/superpowers/specs/2026-05-18-professional-dj-audit-design.md`
- Read: `docs/superpowers/plans/2026-05-18-professional-dj-audit.md`

- [ ] **Step 1: Summarize completed checks**

Report in Korean using this structure:

```markdown
## 점검 결과
- 서버 기동: 성공/실패
- 브라우저 초기 로드: 성공/실패
- Library/Browse: 성공/실패
- Deck 운용: 성공/실패
- FX: 성공/실패
- REC: 성공/실패
- Stem Split: 성공/실패 또는 Demucs 상태상 제한

## 반영한 개선
- 파일: 변경 내용

## 전문 DJ 관점 장기 개선 후보
- Headphone cue/pre-listen
- Persistent cue memory
- Manual beatgrid/quantize
- MIDI/controller mapping
- Gain staging and limiter/metering
```

- [ ] **Step 2: Do not commit unless explicitly requested**

Do not run `git commit` unless the user explicitly asks for a commit.

---

## Self-Review

Spec coverage:

- Track preparation speed: covered by Task 2 Steps 2-4 and Task 3 Steps 4.
- Deck operation: covered by Task 2 Step 5 and Task 3 Steps 1-2.
- Mixing visibility: covered by Task 2 Steps 3, 4, 6 and Task 4.
- FX responsiveness: covered by Task 2 Step 6 and Task 4 Step 2.
- REC and Stem Split stability: covered by Task 2 Steps 7-8 and Task 3 Steps 3, 5.
- Browser verification: covered by Task 2 and Task 4.
- Long-term features excluded from implementation: covered by Task 5 report.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation placeholders are present.
- Each code-change pattern includes exact code and expected behavior.

Type consistency:

- Existing functions `log`, `$`, `splitStems`, `pollStemJob`, and `Deck` are used consistently with `static/app.js`.
- `deck.stemJobRunning` is introduced as a Boolean Deck instance property.
