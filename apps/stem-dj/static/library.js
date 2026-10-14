// 트랙 라이브러리 — 목록 상태·렌더·탐색. 덱 의존은 initLibrary 콜백으로 주입 (순환 의존 차단)
import { $, log, getBpmCache } from "./util.js";

let libraryTracks = [];
let selectedTrack = null;
const localObjectUrls = [];

// initLibrary로 주입되는 어댑터
let loadTrack = () => {};
let activeUrls = () => new Set();

export function initLibrary(adapters) {
  loadTrack = adapters.loadTrack;
  activeUrls = adapters.activeUrls;
  bindLibraryControls();
}

export async function refreshLibrary() {
  // 덱에서 사용 중이지 않은 local object URL 해제
  const inUse = activeUrls();
  for (let i = localObjectUrls.length - 1; i >= 0; i--) {
    if (!inUse.has(localObjectUrls[i])) {
      URL.revokeObjectURL(localObjectUrls[i]);
      localObjectUrls.splice(i, 1);
    }
  }
  const res = await fetch("/api/library");
  const data = await res.json();
  libraryTracks = data.tracks;
  libraryTracks.forEach(t => { if (!t.bpm) t.bpm = getBpmCache(t.id); });
  $("libraryPath").textContent = data.library;
  $("libraryInput").value = data.library;
  const demucsText = data.demucs ? "Demucs detected. Stem Split is available." : "Demucs not detected. Playback works; stem split needs Demucs.";
  $("demucsState").textContent = data.scanMessage ? `${demucsText} ${data.scanMessage}` : demucsText;
  renderTracks();
  renderLibraryTab();
}

export function renderTracks() {
  const q = $("search").value.trim().toLowerCase();
  const list = $("trackList");
  list.innerHTML = "";
  libraryTracks.filter((t) => t.title.toLowerCase().includes(q) || t.filename.toLowerCase().includes(q)).forEach((track) => {
    const row = document.createElement("div");
    row.className = "track" + (selectedTrack?.id === track.id ? " selected" : "");
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
    row.addEventListener("click", () => {
      selectedTrack = track;
      renderTracks();
      renderSelectedPreview();
    });
    row.addEventListener("dblclick", () => loadTrack("A", track));
    list.appendChild(row);
  });
}

export function renderLibraryTab() {
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
      { text: track.size ? `${Math.round(Number(track.size) / 1024 / 1024)} MB` : "local", tag: "span" },
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
        loadTrack(deckId, track);
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
  if (status && $("libraryPath")) {
    status.textContent = `${tracks.length}개 트랙 · ${$("libraryPath").textContent}`;
  }
}

export function renderBrowseTab() {
  const bpmMin = Number($("bpmMin")?.value ?? 40);
  const bpmMax = Number($("bpmMax")?.value ?? 220);
  const stemsReady = $("fStemsReady")?.checked ?? false;
  const stemsNo = $("fStemsNo")?.checked ?? false;
  const extChecks = ["mp3", "wav", "flac", "m4a"];
  const exts = extChecks.filter((e) => $(`fExt_${e}`)?.checked ?? false);

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
  if (!container) return;
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
    const sizeStr = track.size ? `${Math.round(Number(track.size) / 1024 / 1024)} MB` : "local";
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
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedTrack = track;
        loadTrack(deckId, track);
      });
      actions.appendChild(btn);
    });

    row.appendChild(info);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

export function renderSelectedPreview() {
  const box = $("selectedPreview");
  if (!selectedTrack) {
    box.textContent = "No track selected";
    return;
  }
  box.innerHTML = "";
  const titleEl = document.createElement("strong");
  titleEl.textContent = selectedTrack.title;
  const fnameEl = document.createElement("span");
  fnameEl.textContent = selectedTrack.filename;
  const stemsEl = document.createElement("span");
  stemsEl.textContent = selectedTrack.stemReady ? "Stem cache ready" : "Original track";
  [titleEl, document.createElement("br"), fnameEl, document.createElement("br"), stemsEl]
    .forEach((el) => box.appendChild(el));
}

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

function loadSelectedTo(deckId) {
  if (!selectedTrack) {
    log("먼저 라이브러리에서 곡을 선택하세요.");
    return;
  }
  loadTrack(deckId, selectedTrack);
}

function bindLibraryControls() {
  $("refreshLibrary").addEventListener("click", refreshLibrary);
  $("saveLibrary").addEventListener("click", async () => {
    const library = $("libraryInput").value.trim();
    if (!library) {
      log("라이브러리 경로가 비어 있습니다.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library }),
    });
    const data = await response.json();
    if (!response.ok || data.status === "error") {
      log(data.message || "라이브러리 설정 실패");
      return;
    }
    selectedTrack = null;
    await refreshLibrary();
    renderSelectedPreview();
    log(`Library set: ${data.library}`);
  });
  $("search").addEventListener("input", renderTracks);
  // LIBRARY 탭 컨트롤
  $("libSearch")?.addEventListener("input", renderLibraryTab);
  $("libFilter")?.addEventListener("change", renderLibraryTab);
  $("libSort")?.addEventListener("change", renderLibraryTab);
  $("libRefresh")?.addEventListener("click", () => refreshLibrary().then(renderLibraryTab));
  // BROWSE 탭 컨트롤
  $("browseApply")?.addEventListener("click", renderBrowseTab);
  $("browseReset")?.addEventListener("click", () => {
    $("bpmMin").value = 60;
    $("bpmMax").value = 200;
    ["fStemsReady", "fStemsNo"].forEach((id) => { $(id).checked = true; });
    ["mp3", "wav", "flac", "m4a"].forEach((e) => { $(`fExt_${e}`).checked = true; });
    renderBrowseTab();
  });
  $("loadToA").addEventListener("click", () => loadSelectedTo("A"));
  $("loadToB").addEventListener("click", () => loadSelectedTo("B"));
  $("filePicker").addEventListener("change", (event) => {
    const files = [...event.target.files];
    const localTracks = files.map(localFileTrack);
    libraryTracks = [...localTracks, ...libraryTracks];
    selectedTrack = localTracks[0] || selectedTrack;
    renderTracks();
    renderSelectedPreview();
    log(`${localTracks.length} local file(s) added`);
  });
}
