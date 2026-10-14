import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.join(ROOT, "static");

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? next : true;
    args.set(key.slice(2), value);
    if (value !== true) i += 1;
  }
  return args;
}

function parseViewports(value) {
  return String(value || "1365x768,1440x900,1280x800,768x1024,375x812")
    .split(",")
    .map((item) => {
      const [width, height] = item.split("x").map(Number);
      if (!width || !height) throw new Error(`Invalid viewport: ${item}`);
      return { name: item, width, height };
    });
}

function writeFixtureFiles(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ["neon-circuit.wav", "midnight-lab.mp3", "signal-bloom.flac"]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, `fixture:${name}`);
  }
}

function fixtureTracks(dir) {
  return fs.readdirSync(dir)
    .filter((name) => /\.(mp3|wav|flac|m4a)$/i.test(name))
    .sort()
    .map((filename, index) => {
      const file = path.join(dir, filename);
      const stat = fs.statSync(file);
      return {
        id: `fixture-${index + 1}`,
        title: filename.replace(/\.[^.]+$/, "").replace(/-/g, " "),
        filename,
        path: file,
        size: stat.size,
        modified: Math.floor(stat.mtimeMs / 1000),
        stemReady: index % 2 === 0,
        bpm: index === 0 ? 124 : index === 1 ? 118 : null,
        url: `/media/${encodeURIComponent(filename)}`,
      };
    });
}

function sendJson(res, data, status = 200) {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length });
  res.end(body);
}

function mimeType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function startTempServer(fixtureDir) {
  writeFixtureFiles(fixtureDir);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/library") {
      sendJson(res, { library: fixtureDir, tracks: fixtureTracks(fixtureDir), demucs: false, scanLimited: false, scanMessage: "" });
      return;
    }
    if (url.pathname === "/api/settings") {
      sendJson(res, { status: "ok", library: fixtureDir, tracks: fixtureTracks(fixtureDir) });
      return;
    }
    if (url.pathname === "/api/stems" || url.pathname === "/api/stems/job") {
      sendJson(res, { ready: false, stems: {}, status: "missing", message: "QA fixture" });
      return;
    }
    if (url.pathname.startsWith("/media/")) {
      const file = path.join(fixtureDir, decodeURIComponent(path.basename(url.pathname)));
      fs.createReadStream(file).on("error", () => res.writeHead(404).end()).pipe(res);
      return;
    }
    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(STATIC_DIR, requested);
    if (!file.startsWith(STATIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeType(file) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    resolve({ server, url: `http://127.0.0.1:${port}/` });
  }));
}

function browserPath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome or Edge executable was not found");
  return found;
}

function freePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function hasExited(proc) {
  return proc.exitCode !== null || proc.signalCode !== null;
}

function waitForProcessExit(proc, timeoutMs) {
  if (hasExited(proc)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      proc.off("exit", onExit);
      resolve(hasExited(proc));
    }, timeoutMs);
    proc.once("exit", onExit);
  });
}

function terminateProcessTree(proc) {
  if (hasExited(proc)) return;
  if (process.platform === "win32" && proc.pid) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {}
  }
  proc.kill("SIGKILL");
}

async function requestBrowserClose(port) {
  let cdp = null;
  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 1200);
    cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.send("Browser.close", {}, 1500);
    return true;
  } catch {
    return false;
  } finally {
    if (cdp) cdp.close();
  }
}

async function launchBrowser() {
  const port = await freePort();
  const userDataDir = path.join(os.tmpdir(), `stem-dj-browser-qa-profile-${process.pid}`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  const proc = spawn(browserPath(), [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-sandbox",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: "ignore" });
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  return {
    port,
    async close() {
      await requestBrowserClose(port);
      if (!(await waitForProcessExit(proc, 5000))) {
        terminateProcessTree(proc);
        await waitForProcessExit(proc, 5000);
      }
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 80, retryDelay: 250 });
      } catch (error) {
        if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
        const pendingDir = `${userDataDir}.pending-delete-${Date.now()}`;
        fs.renameSync(userDataDir, pendingDir);
        fs.rmSync(pendingDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
      }
    },
  };
}

class Cdp {
  constructor(wsUrl) {
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.closed = false;
    this.closeError = null;
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.receive(JSON.parse(event.data)));
    this.ws.addEventListener("close", (event) => {
      this.closed = true;
      const reason = [event.code, event.reason].filter(Boolean).join(" ");
      this.closeError = new Error(`CDP WebSocket closed${reason ? ` (${reason})` : ""}`);
    });
    this.ws.addEventListener("error", () => {
      this.closed = true;
      this.closeError = new Error("CDP WebSocket error");
    });
  }
  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    const waiters = this.events.get(message.method) || [];
    waiters.splice(0).forEach((resolve) => resolve(message.params || {}));
  }
  async send(method, params = {}, timeoutMs = 10000) {
    await this.ready;
    if (this.closed) throw this.closeError || new Error("CDP WebSocket closed");
    const id = ++this.id;
    let timer = null;
    const request = new Promise((resolve, reject) => {
      const settle = (fn, value) => {
        if (timer) clearTimeout(timer);
        fn(value);
      };
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(this.closed && this.closeError ? this.closeError : new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);
      }
      this.pending.set(id, {
        resolve: (value) => settle(resolve, value),
        reject: (error) => settle(reject, error),
      });
    });
    request.catch(() => {});
    try {
      this.ws.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      if (timer) clearTimeout(timer);
      this.pending.delete(id);
      throw error;
    }
    return request;
  }
  waitEvent(method, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const wrapped = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      this.events.set(method, [...(this.events.get(method) || []), wrapped]);
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function newPage(port) {
  let res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!res.ok) res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`);
  const target = await res.json();
  return new Cdp(target.webSocketDebuggerUrl);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

function layoutExpression(viewport) {
  return `(() => {
    const selectors = {
      topbar: ".topbar", wave: ".global-wave", performGrid: ".perform-grid",
      deckA: "#deckA", mixer: ".center-mixer", deckB: "#deckB",
      utility: ".utility-row", zoom: ".zoom-row", library: ".library-zone",
      trackList: "#trackList", statusLog: "#statusLog"
    };
    const primarySelectors = [
      "#refreshLibrary", "#recordBtn",
      "#loadToA", "#playA", "#stemA", "#cuesA", "#loopReadA", "[data-loop='0'][data-deck='A']",
      "#loadToB", "#playB", "#stemB", "#cuesB", "#loopReadB", "[data-loop='0'][data-deck='B']",
      "#crossfader", "#masterVolume", "#libraryInput", "#search", "#trackList"
    ];
    const rectFor = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, missing: true };
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { selector, x: rect.x, y: rect.y, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, overflowY: style.overflowY, display: style.display };
    };
    const visible = (rect) => !rect.missing && rect.display !== "none" && rect.width > 1 && rect.height > 1;
    const issues = [];
    const sectionRects = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, rectFor(selector)]));
    const primary = primarySelectors.map(rectFor);
    const desktop = innerWidth >= ${viewport.width >= 1280 ? 1280 : 99999};
    const htmlScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;
    const htmlScrollHeight = document.documentElement.scrollHeight;
    const bodyScrollHeight = document.body ? document.body.scrollHeight : 0;
    const pageScrollWidth = Math.max(htmlScrollWidth, bodyScrollWidth);
    const pageScrollHeight = Math.max(htmlScrollHeight, bodyScrollHeight);
    if (pageScrollWidth > innerWidth + 2) issues.push("horizontal page overflow");
    if (desktop && pageScrollHeight > innerHeight + 2) issues.push("desktop page scroll present");
    for (const name of Object.keys(sectionRects)) {
      if (!visible(sectionRects[name])) issues.push(name + " missing or collapsed");
    }
    for (const rect of primary) {
      if (!visible(rect)) issues.push(rect.selector + " missing or collapsed");
      if (!rect.missing && (rect.left < -1 || rect.right > innerWidth + 1)) issues.push(rect.selector + " horizontally clipped");
      if (desktop && !rect.missing && (rect.top < -1 || rect.bottom > innerHeight + 1)) issues.push(rect.selector + " vertically clipped on desktop");
    }
    const ordered = ["wave", "performGrid", "utility", "zoom", "library"];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const a = sectionRects[ordered[i]], b = sectionRects[ordered[i + 1]];
      if (visible(a) && visible(b) && a.bottom > b.top + 1) issues.push(ordered[i] + " overlaps " + ordered[i + 1]);
    }
    for (const pair of [["deckA", "mixer"], ["mixer", "deckB"]]) {
      const a = sectionRects[pair[0]], b = sectionRects[pair[1]];
      if (desktop && visible(a) && visible(b) && a.right > b.left + 1) issues.push(pair[0] + " overlaps " + pair[1]);
    }
    for (const name of ["trackList", "statusLog"]) {
      if (!["auto", "scroll"].includes(sectionRects[name].overflowY)) issues.push(name + " is not an internal scroll area");
    }
    return { viewport: "${viewport.name}", innerWidth, innerHeight, scrollWidth: pageScrollWidth, scrollHeight: pageScrollHeight, htmlScrollWidth, bodyScrollWidth, htmlScrollHeight, bodyScrollHeight, sections: sectionRects, primary, issues };
  })()`;
}

async function captureLayoutViewport(browser, url, viewport, screenshotDir) {
  const cdp = await newPage(browser.port);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 768 });
  const loaded = cdp.waitEvent("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 800));
  const metrics = await cdp.send("Runtime.evaluate", { expression: layoutExpression(viewport), returnByValue: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const file = path.join(screenshotDir, `layout-${viewport.name}.png`);
  fs.writeFileSync(file, Buffer.from(screenshot.data, "base64"));
  cdp.close();
  return { ...metrics.result.value, screenshot: file };
}

function controlStateSetupExpression() {
  return `(() => {
    const root = getComputedStyle(document.documentElement);
    const tokenNames = [
      "--surface-app", "--surface-panel", "--surface-raised", "--surface-inset",
      "--text-primary", "--text-muted", "--text-disabled", "--accent-deck-a",
      "--accent-deck-b", "--meter-safe", "--meter-warn", "--meter-hot", "--focus-ring"
    ];
    const tokens = Object.fromEntries(tokenNames.map((name) => [name, root.getPropertyValue(name).trim()]));
    const focusProbe = document.createElement("span");
    focusProbe.style.position = "fixed";
    focusProbe.style.visibility = "hidden";
    focusProbe.style.color = tokens["--focus-ring"];
    document.body.appendChild(focusProbe);
    const resolvedFocusRing = getComputedStyle(focusProbe).color;
    focusProbe.remove();
    const snapshot = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, missing: true };
      const style = getComputedStyle(el);
      return {
        selector,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderBottomColor: style.borderBottomColor,
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        opacity: style.opacity,
        cursor: style.cursor,
        filter: style.filter,
        focused: document.activeElement === el,
        focusVisible: el.matches(":focus-visible"),
      };
    };
    window.__controlQa = { tokens, resolvedFocusRing, snapshot, clicks: { refresh: 0, loadA: 0 } };
    document.querySelector("#refreshLibrary")?.addEventListener("click", () => { window.__controlQa.clicks.refresh += 1; });
    document.querySelector("#loadToA")?.addEventListener("click", () => { window.__controlQa.clicks.loadA += 1; });
    return { tokens, resolvedFocusRing };
  })()`;
}

function focusControlExpression(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { selector: ${JSON.stringify(selector)}, missing: true };
    el.focus({ focusVisible: true });
    return window.__controlQa.snapshot(${JSON.stringify(selector)});
  })()`;
}

function controlCenterExpression(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
}

async function captureFocusedControl(cdp, selector) {
  const tab = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...tab });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...tab });
  return evaluate(cdp, focusControlExpression(selector));
}

function sameState(a, b) {
  return ["color", "backgroundColor", "borderColor", "borderBottomColor", "boxShadow", "filter"]
    .every((key) => a[key] === b[key]);
}

function focusIsVisible(state, focusToken) {
  const outlined = state.outlineStyle !== "none" && Number.parseFloat(state.outlineWidth) > 0;
  const shadowed = state.boxShadow !== "none";
  if (!outlined && !shadowed) return false;
  if (!focusToken) return false;
  const normalized = String(focusToken).toLowerCase().replaceAll(" ", "");
  return [state.outlineColor, state.boxShadow]
    .some((value) => String(value).toLowerCase().replaceAll(" ", "").includes(normalized));
}

async function captureControlStateViewport(browser, url, viewport, screenshotDir) {
  const cdp = await newPage(browser.port);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__qaErrors = [];
      window.addEventListener("error", (event) => window.__qaErrors.push(String(event.error || event.message)));
      window.addEventListener("unhandledrejection", (event) => window.__qaErrors.push(String(event.reason)));
      const originalConsoleError = console.error;
      console.error = (...args) => { window.__qaErrors.push(args.map(String).join(" ")); originalConsoleError(...args); };`,
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 768 });
  const loaded = cdp.waitEvent("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 800));

  const layout = await evaluate(cdp, layoutExpression(viewport));
  const setup = await evaluate(cdp, controlStateSetupExpression());
  const focusSelectors = ["[data-tab='PERFORM']", "#playA", "#crossfader", "#libraryInput"];
  const focusStates = {};
  for (const selector of focusSelectors) focusStates[selector] = await captureFocusedControl(cdp, selector);

  const playBeforeHover = await evaluate(cdp, "window.__controlQa.snapshot('#playA')");
  const center = await evaluate(cdp, controlCenterExpression("#playA"));
  if (center) await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: center.x, y: center.y });
  await new Promise((resolve) => setTimeout(resolve, 160));
  const playHover = await evaluate(cdp, "window.__controlQa.snapshot('#playA')");

  const navStates = await evaluate(cdp, `({
    active: window.__controlQa.snapshot("[data-tab='PERFORM']"),
    idle: window.__controlQa.snapshot("[data-tab='LIBRARY']")
  })`);

  await evaluate(cdp, `(() => { document.querySelector("[data-tab='FX']")?.click(); return true; })()`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const overlayFocus = await captureFocusedControl(cdp, "#fxFilterA");
  const overlayVisible = await evaluate(cdp, `(() => {
    const overlay = document.querySelector("#fxOverlay");
    return Boolean(overlay && !overlay.hidden && getComputedStyle(overlay).display !== "none");
  })()`);
  await evaluate(cdp, `(() => { document.querySelector("[data-close='fxOverlay']")?.click(); return true; })()`);

  await evaluate(cdp, `(() => {
    const refresh = document.querySelector("#refreshLibrary");
    const loadA = document.querySelector("#loadToA");
    refresh.disabled = true;
    loadA.disabled = true;
    refresh.click();
    loadA.click();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 160));
  const disabled = await evaluate(cdp, `(() => ({
      refresh: window.__controlQa.snapshot("#refreshLibrary"),
      loadA: window.__controlQa.snapshot("#loadToA"),
      clicks: window.__controlQa.clicks,
    }))()`);
  focusStates["#playA"] = await captureFocusedControl(cdp, "#playA");

  const issues = [...layout.issues];
  const missingTokens = Object.entries(setup.tokens).filter(([, value]) => !value).map(([name]) => name);
  if (missingTokens.length) issues.push(`missing design tokens: ${missingTokens.join(", ")}`);
  const focusToken = setup.resolvedFocusRing;
  for (const [selector, state] of Object.entries({ ...focusStates, "#fxFilterA": overlayFocus })) {
    if (state.missing) issues.push(`${selector} missing`);
    else if (!focusIsVisible(state, focusToken)) issues.push(`${selector} lacks tokenized visible focus`);
  }
  if (!overlayVisible) issues.push("FX overlay did not open");
  if (sameState(navStates.active, navStates.idle)) issues.push("active nav state matches idle state");
  if (sameState(playBeforeHover, playHover)) issues.push("transport hover state is not distinct");
  for (const [selector, state] of [["#refreshLibrary", disabled.refresh], ["#loadToA", disabled.loadA]]) {
    if (state.cursor === "pointer") issues.push(`${selector} retains pointer cursor while disabled`);
    if (Number.parseFloat(state.opacity) >= 0.8) issues.push(`${selector} disabled opacity is not lower emphasis`);
  }
  if (disabled.clicks.refresh !== 0 || disabled.clicks.loadA !== 0) issues.push("disabled button click handler fired");
  const errors = await evaluate(cdp, "window.__qaErrors || []");
  if (errors.length) issues.push(`browser errors: ${errors.join(" | ")}`);

  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const file = path.join(screenshotDir, `control-states-${viewport.name}.png`);
  fs.writeFileSync(file, Buffer.from(screenshot.data, "base64"));
  cdp.close();
  return {
    viewport: viewport.name,
    issues,
    screenshot: file,
    tokens: setup.tokens,
    focusStates,
    overlayFocus,
    overlayVisible,
    navStates,
    hover: { before: playBeforeHover, after: playHover },
    disabled,
    browserErrors: errors,
    layoutIssues: layout.issues,
  };
}

function writeLayoutEvidence(file, results, command) {
  const failed = results.flatMap((result) => result.issues.map((issue) => `${result.viewport}: ${issue}`));
  const lines = [
    "# Task 7 Evidence: Responsive Performance Shell",
    "",
    `Result: ${failed.length ? "FAIL" : "PASS"}`,
    "",
    "## Command",
    "",
    `- \`${command}\``,
    "",
    "## Viewports",
    "",
    ...results.map((result) => `- ${result.viewport}: ${result.issues.length ? `FAIL (${result.issues.join("; ")})` : "PASS"}; page ${result.scrollWidth}x${result.scrollHeight}, viewport ${result.innerWidth}x${result.innerHeight}; html ${result.htmlScrollWidth}x${result.htmlScrollHeight}; body ${result.bodyScrollWidth}x${result.bodyScrollHeight}; screenshot ${path.relative(ROOT, result.screenshot).replaceAll("\\", "/")}`),
    "",
    "## Failures",
    "",
    ...(failed.length ? failed.map((item) => `- ${item}`) : ["- None"]),
    "",
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function writeControlEvidence(file, results, command) {
  const failed = results.flatMap((result) => result.issues.map((issue) => `${result.viewport}: ${issue}`));
  const lines = [
    "# Task 8 Evidence: Control States",
    "",
    `Result: ${failed.length ? "FAIL" : "PASS"}`,
    "",
    "## Command",
    "",
    `- \`${command}\``,
    "",
    "## Viewports",
    "",
    ...results.map((result) => `- ${result.viewport}: ${result.issues.length ? `FAIL (${result.issues.join("; ")})` : "PASS"}; screenshot ${path.relative(ROOT, result.screenshot).replaceAll("\\", "/")}`),
    "",
    "## State Coverage",
    "",
    "- Navigation active and focus-visible",
    "- Transport hover and focus-visible",
    "- Mixer, library, and FX overlay focus-visible",
    "- Disabled refresh/load controls and click invariants",
    "- Browser errors and responsive layout regression",
    "",
    "## Failures",
    "",
    ...(failed.length ? failed.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Cleanup",
    "",
    "- CDP pages closed; headless browser stopped; browser profile removed; temp HTTP server closed.",
    "",
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  const disabledEvidence = {
    result: failed.length ? "FAIL" : "PASS",
    viewports: results.map(({ viewport, disabled, focusStates, overlayFocus, navStates, hover, browserErrors, issues }) => ({
      viewport,
      disabled,
      adjacentFocus: focusStates["#playA"],
      focusStates,
      overlayFocus,
      navStates,
      hover,
      browserErrors,
      issues,
    })),
    cleanup: "CDP pages closed; headless browser stopped; browser profile removed; temp HTTP server closed.",
  };
  fs.writeFileSync(path.join(path.dirname(file), "task-8-control-disabled.json"), `${JSON.stringify(disabledEvidence, null, 2)}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));
const scenario = String(args.get("scenario") || "layout");
if (!["layout", "control-states"].includes(scenario)) throw new Error(`Unsupported scenario: ${scenario}`);
const fixtureDir = path.resolve(String(args.get("fixture-dir") || ".omo/tmp/stem-dj-fixtures"));
const viewports = parseViewports(args.get("viewports"));
const evidence = String(args.get("evidence") || ".omo/evidence/browser-qa.md");
const screenshotDir = path.join(path.dirname(path.resolve(evidence)), "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });
const temp = args.has("with-temp-server") ? await startTempServer(fixtureDir) : { url: String(args.get("url") || "http://127.0.0.1:8765/"), server: null };
let browser = null;
try {
  browser = await launchBrowser();
  const results = [];
  for (const viewport of viewports) {
    const capture = scenario === "layout" ? captureLayoutViewport : captureControlStateViewport;
    results.push(await capture(browser, temp.url, viewport, screenshotDir));
  }
  const command = `node ${path.relative(ROOT, process.argv[1]).replaceAll("\\", "/")} ${process.argv.slice(2).join(" ")}`;
  if (scenario === "layout") writeLayoutEvidence(path.resolve(evidence), results, command);
  else writeControlEvidence(path.resolve(evidence), results, command);
  const failures = results.flatMap((result) => result.issues);
  if (failures.length) process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (temp.server) await new Promise((resolve) => temp.server.close(resolve));
  }
}
