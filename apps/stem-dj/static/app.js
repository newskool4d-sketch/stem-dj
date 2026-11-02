// 엔트리 — 모듈 조립과 전역 UI 바인딩만 담당
import { $, log } from "./util.js";
import { audioCtx, masterGain } from "./audio-engine.js";
import { applyAudioParamTarget, audioParamTarget, percentToUnitTarget } from "./audio-params.js";
import { crossfadeGains } from "./deck-logic.js";
import { Deck } from "./deck.js";
import {
  initLibrary,
  refreshLibrary,
  renderLibraryTab,
  renderBrowseTab,
} from "./library.js";
import { setupRecording } from "./recording.js";

const decks = {
  A: new Deck("A", { onGraphReady: updateCrossfader }),
  B: new Deck("B", { onGraphReady: updateCrossfader }),
};

let lastClockAt = 0;

function updateCrossfader() {
  if (!masterGain) return;
  const { a, b } = crossfadeGains(Number($("crossfader").value));
  const now = audioCtx?.currentTime ?? 0;
  applyAudioParamTarget(decks.A.deckGain?.gain, audioParamTarget(a, { now }));
  applyAudioParamTarget(decks.B.deckGain?.gain, audioParamTarget(b, { now }));
}

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

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
let overlayReturnFocus = null;

function toggleOverlay(name) {
  const el = document.getElementById(name === "REC" ? "recOverlay" : "fxOverlay");
  if (el.hidden) openOverlay(el);
  else closeOverlay(el);
}

function openOverlay(el) {
  document.querySelectorAll(".overlay:not([hidden])").forEach((o) => { o.hidden = true; });
  overlayReturnFocus = overlayReturnFocus ?? document.activeElement;
  el.hidden = false;
  if (el.id === "fxOverlay") syncFxOverlaySliders();
  el.querySelector(".overlay-panel input, .overlay-panel button:not(.overlay-close)")?.focus();
}

function closeOverlay(el) {
  el.hidden = true;
  overlayReturnFocus?.focus?.();
  overlayReturnFocus = null;
}

// 열린 오버레이 안에서 Escape 닫기·Tab 순환. 처리했으면 true.
function handleOverlayKey(e) {
  const el = document.querySelector(".overlay:not([hidden])");
  if (!el) return false;
  if (e.key === "Escape") {
    e.preventDefault();
    closeOverlay(el);
    return true;
  }
  if (e.key === "Tab") {
    const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && !n.disabled);
    if (!items.length) return false;
    const first = items[0];
    const last = items[items.length - 1];
    if (!el.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
    return true;
  }
  return false;
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
      // 역방향: 값만 복사 (이벤트 재발생 없음 → 재귀 방지)
      util.addEventListener("input", () => {
        overlay.value = util.value;
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
      const target = percentToUnitTarget(e.target.value, { now: audioCtx?.currentTime ?? 0 });
      const v = target.value;
      applyAudioParamTarget(deck.bitcrusher.parameters.get("wet"), target);
      deck.bitcrusher.parameters.get("bits").value = Math.max(1, Math.round(16 - v * 12));
    });
  });
}

function bindGlobalControls() {
  // 센터 믹서 탭 전환
  document.querySelectorAll(".mixer-tabs button[data-mixer-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.mixerTab;
      document.querySelectorAll(".mixer-tabs button").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      ["MIXER", "FX", "FILTER"].forEach((p) => {
        const el = document.getElementById(`mixerPanel${p}`);
        if (el) el.hidden = p !== name;
      });
    });
  });

  document.querySelectorAll(".nav-tabs button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
  document.querySelectorAll(".overlay-close[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeOverlay(document.getElementById(btn.dataset.close)));
  });
  $("crossfader").addEventListener("input", updateCrossfader);
  $("masterVolume").addEventListener("input", (event) => {
    applyAudioParamTarget(
      masterGain?.gain,
      percentToUnitTarget(event.target.value, { now: audioCtx?.currentTime ?? 0 }),
    );
  });
  $("syncBtn").addEventListener("click", () => {
    if (!decks.A.track || !decks.B.track) {
      log("Sync requires tracks loaded on both Deck A and Deck B.");
      return;
    }
    if (!decks.A.bpm || !decks.B.bpm) {
      log("Sync requires BPM analysis on both decks. Play or load tracks and wait for BPM detection.");
      return;
    }
    const rate = decks.A.bpm / decks.B.bpm;
    const pct = Math.max(-16, Math.min(16, (rate - 1) * 100));
    $("tempoB").value = pct;
    $("tempoB").dispatchEvent(new Event("input"));
    log(`Deck B synced to Deck A: ${pct.toFixed(1)}%`);
  });
  document.querySelectorAll("[data-loop]").forEach((btn) => {
    btn.addEventListener("click", () => decks[btn.dataset.deck].setLoop(Number(btn.dataset.loop)));
  });
  bindFxOverlayControls();

  document.addEventListener("keydown", (e) => {
    if (handleOverlayKey(e)) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    // 버튼·링크에 포커스가 있으면 Space/Enter는 그 요소의 기본 동작(클릭)에 맡긴다
    if ((e.code === "Space" || e.code === "Enter") &&
        document.activeElement?.closest("button, a[href], summary, [role='button']")) return;
    switch (e.code) {
      case "Space":       e.preventDefault(); decks.A.togglePlay(); break;
      case "Enter":       e.preventDefault(); decks.B.togglePlay(); break;
      case "Digit1":      decks.A.triggerHotCue(0); break;
      case "Digit2":      decks.A.triggerHotCue(1); break;
      case "Digit3":      decks.A.triggerHotCue(2); break;
      case "Digit4":      decks.A.triggerHotCue(3); break;
      case "Digit7":      decks.B.triggerHotCue(0); break;
      case "Digit8":      decks.B.triggerHotCue(1); break;
      case "Digit9":      decks.B.triggerHotCue(2); break;
      case "Digit0":      decks.B.triggerHotCue(3); break;
      case "KeyQ":        decks.A.setLoop(0.5); break;
      case "KeyW":        decks.A.setLoop(1);   break;
      case "KeyE":        decks.A.setLoop(4);   break;
      case "KeyR":        decks.A.setLoop(8);   break;
      case "KeyT":        decks.A.clearLoop();  break;
      case "KeyU":        decks.B.setLoop(0.5); break;
      case "KeyI":        decks.B.setLoop(1);   break;
      case "KeyO":        decks.B.setLoop(4);   break;
      case "KeyP":        decks.B.setLoop(8);   break;
      case "BracketLeft": decks.B.clearLoop();  break;
      case "ArrowLeft":
        e.preventDefault();
        if (e.shiftKey) decks.B.jumpTo(decks.B.currentTime() - 5);
        else            decks.A.jumpTo(decks.A.currentTime() - 5);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (e.shiftKey) decks.B.jumpTo(decks.B.currentTime() + 5);
        else            decks.A.jumpTo(decks.A.currentTime() + 5);
        break;
    }
  });
}

function tick(now = performance.now()) {
  decks.A.tick(now);
  decks.B.tick(now);
  if (now - lastClockAt > 1000) {
    $("clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    lastClockAt = now;
  }
  requestAnimationFrame(tick);
}

initLibrary({
  loadTrack: (deckId, track) => {
    decks[deckId].loadMix(track).catch((err) => log(`Deck ${deckId} 로드 실패: ${err.message}`));
  },
  activeUrls: () => new Set(Object.values(decks).map((d) => d.track?.url).filter(Boolean)),
});
bindGlobalControls();
setupRecording();
refreshLibrary().catch((err) => log(err.message));
tick();
