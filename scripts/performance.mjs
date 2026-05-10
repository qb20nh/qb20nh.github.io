import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");
const FIRST_PROJECT = "grr";
const DIRECT_PROJECT = "tttt";
const CHROME_TIMEOUT_MS = 10_000;
const INTERACTION_TIMEOUT_MS = 8_000;
const LCP_SETTLE_MS = 2_500;

const profiles = [
  {
    name: "mobile",
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
    cpuThrottlingRate: 4,
    network: {
      offline: false,
      latency: 150,
      downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8),
      uploadThroughput: Math.floor((750 * 1024) / 8),
    },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  },
  {
    name: "desktop",
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    cpuThrottlingRate: 1,
    network: null,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  },
];

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error("Missing dist/index.html. Run `pnpm build` first.");
  }
  if (!globalThis.WebSocket) {
    throw new Error("This script requires a Node runtime with global WebSocket.");
  }

  const sizes = measureBuildSize();
  const server = await createStaticServer();
  const chrome = await launchChrome();
  const connection = new CdpConnection(chrome.webSocketDebuggerUrl);

  try {
    await connection.open();
    const results = [];
    for (const profile of profiles) {
      results.push(await measureProfile(connection, server.origin, profile));
    }

    const report = { build: sizes, profiles: results };
    printReport(report);
  } finally {
    await connection.close().catch(() => {});
    await chrome.close();
    await server.close();
  }
}

function measureBuildSize() {
  const files = [
    join(DIST, "index.html"),
    ...readdirSync(join(DIST, "assets")).map((file) => join(DIST, "assets", file)),
  ].filter((file) => existsSync(file) && statSync(file).isFile());

  const entries = files.map((file) => {
    const content = readFileSync(file);
    const name = file.startsWith(join(DIST, "assets"))
      ? `assets/${basename(file)}`
      : basename(file);
    const role =
      name === "index.html"
        ? "html"
        : basename(name).startsWith("index-")
          ? "initial"
          : "lazy";

    return {
      name,
      role,
      raw: content.length,
      gzip: gzipSync(content).length,
      brotli: brotliCompressSync(content).length,
    };
  });

  return {
    files: entries,
    totals: summarizeSizes(entries),
    byRole: Object.fromEntries(
      ["html", "initial", "lazy"].map((role) => [
        role,
        summarizeSizes(entries.filter((entry) => entry.role === role)),
      ]),
    ),
  };
}

function summarizeSizes(entries) {
  return entries.reduce(
    (total, entry) => ({
      raw: total.raw + entry.raw,
      gzip: total.gzip + entry.gzip,
      brotli: total.brotli + entry.brotli,
    }),
    { raw: 0, gzip: 0, brotli: 0 },
  );
}

async function createStaticServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const filePath = resolve(
      DIST,
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""),
    );
    const safeRoot = `${normalize(DIST)}${sep}`;
    const safePath = normalize(filePath);

    if (safePath !== normalize(DIST) && !safePath.startsWith(safeRoot)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const target = existsSync(filePath) && statSync(filePath).isDirectory()
      ? join(filePath, "index.html")
      : filePath;

    if (!existsSync(target)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentType(target),
    });
    response.end(readFileSync(target));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function contentType(file) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".mp3": "audio/mpeg",
      ".svg": "image/svg+xml",
    }[extname(file)] || "application/octet-stream"
  );
}

async function launchChrome() {
  const executable = findChrome();
  const cdpPort = 9400 + Math.floor(Math.random() * 500);
  const userDataDir = mkdtempSync(join(tmpdir(), "qb20nh-perf-chrome-"));
  const chrome = spawn(executable, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const version = await waitForChrome(cdpPort);
    return {
      webSocketDebuggerUrl: version.webSocketDebuggerUrl,
      close: async () => {
        chrome.kill("SIGTERM");
        await new Promise((resolveClose) => chrome.once("close", resolveClose));
        rmSync(userDataDir, { force: true, recursive: true });
      },
    };
  } catch (error) {
    chrome.kill("SIGTERM");
    rmSync(userDataDir, { force: true, recursive: true });
    throw new Error(`${error.message}\nChrome stderr:\n${stderr.trim()}`);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "chromium",
    "chromium-browser",
    "google-chrome-stable",
    "google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const result = spawnSyncQuiet(candidate, ["--version"]);
      if (result.status === 0) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    "Chrome/Chromium not found. Set CHROME_PATH to a Chromium executable.",
  );
}

function spawnSyncQuiet(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

async function waitForChrome(port) {
  const deadline = Date.now() + CHROME_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
      lastError = new Error(`CDP version returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Chrome CDP: ${lastError?.message}`);
}

class CdpConnection {
  constructor(webSocketDebuggerUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.webSocketDebuggerUrl = webSocketDebuggerUrl;
    this.ws = null;
  }

  open() {
    return new Promise((resolveOpen, rejectOpen) => {
      this.ws = new WebSocket(this.webSocketDebuggerUrl);
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", rejectOpen, { once: true });
      this.ws.addEventListener("message", (event) => {
        this.handleMessage(JSON.parse(event.data));
      });
    });
  }

  close() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }

    return new Promise((resolveClose) => {
      this.ws.addEventListener("close", resolveClose, { once: true });
      this.ws.close();
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;

    const promise = new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, method });
    });
    this.ws.send(JSON.stringify(message));
    return promise;
  }

  on(method, sessionId, handler) {
    const key = eventKey(method, sessionId);
    const handlers = this.listeners.get(key) || new Set();
    handlers.add(handler);
    this.listeners.set(key, handlers);
    return () => handlers.delete(handler);
  }

  waitFor(method, sessionId, timeoutMs = INTERACTION_TIMEOUT_MS) {
    return new Promise((resolveWait, rejectWait) => {
      const timeout = setTimeout(() => {
        off();
        rejectWait(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const off = this.on(method, sessionId, (params) => {
        clearTimeout(timeout);
        off();
        resolveWait(params);
      });
    });
  }

  handleMessage(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(`${pending.method}: ${message.error.message}`),
        );
        return;
      }

      pending.resolve(message.result);
      return;
    }

    const handlers = this.listeners.get(eventKey(message.method, message.sessionId));
    if (!handlers) return;
    for (const handler of handlers) handler(message.params);
  }
}

function eventKey(method, sessionId) {
  return `${sessionId || ""}:${method}`;
}

async function measureProfile(connection, origin, profile) {
  const { targetId } = await connection.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await connection.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  try {
    await setupPage(connection, sessionId, profile);
    await navigateAndSettle(connection, sessionId, `${origin}/`);
    const initialVitals = await readPerfData(connection, sessionId);
    const initialHeap = await sampleHeap(connection, sessionId);
    const initialChecks = await readPageChecks(connection, sessionId);

    const previewMs = await timeAction(async () => {
      const center = await elementCenter(connection, sessionId, `[data-open="${FIRST_PROJECT}"]`);
      await mouseMove(connection, sessionId, center);
      await waitForExpression(
        connection,
        sessionId,
        `document.querySelector('[data-open="${FIRST_PROJECT}"]')` +
          `?.closest('.project-card')?.classList.contains('is-preview-loaded') === true`,
      );
    });
    const afterPreviewHeap = await sampleHeap(connection, sessionId);

    const openMs = await timeAction(async () => {
      const center = await elementCenter(connection, sessionId, `[data-open="${FIRST_PROJECT}"]`);
      await mouseClick(connection, sessionId, center);
      await waitForExpression(
        connection,
        sessionId,
        `document.body.classList.contains('viewer-open') && ` +
          `location.hash === '#${FIRST_PROJECT}' && ` +
          `document.querySelector('#back-control')?.classList.contains('is-visible')`,
      );
    });
    const afterOpenHeap = await sampleHeap(connection, sessionId);

    const closeMs = await closeViewer(connection, sessionId);
    const afterCloseHeap = await sampleHeap(connection, sessionId);

    const cycleHeaps = [];
    for (let index = 0; index < 2; index += 1) {
      await openProject(connection, sessionId, FIRST_PROJECT);
      await closeViewerScripted(connection, sessionId);
      cycleHeaps.push(await sampleHeap(connection, sessionId));
    }

    await navigateAndSettle(connection, sessionId, `${origin}/#${DIRECT_PROJECT}`);
    await waitForExpression(
      connection,
      sessionId,
      `document.body.classList.contains('viewer-open') && ` +
        `location.hash === '#${DIRECT_PROJECT}'`,
    );
    const directHashHeap = await sampleHeap(connection, sessionId);
    const finalPerf = await readPerfData(connection, sessionId);

    return {
      profile: profile.name,
      cwv: summarizeVitals(initialVitals),
      runtime: {
        previewMs,
        openMs,
        closeMs,
        longTasks: summarizeLongTasks(finalPerf.longTasks),
        interactionProxyMs: maxDuration(finalPerf.events),
      },
      memory: {
        initial: initialHeap,
        afterPreview: afterPreviewHeap,
        afterOpen: afterOpenHeap,
        afterClose: afterCloseHeap,
        afterCycles: cycleHeaps,
        directHash: directHashHeap,
      },
      checks: {
        initial: initialChecks,
        final: await readPageChecks(connection, sessionId),
      },
    };
  } finally {
    await connection.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

async function setupPage(connection, sessionId, profile) {
  await connection.send("Page.enable", {}, sessionId);
  await connection.send("Runtime.enable", {}, sessionId);
  await connection.send("Network.enable", {}, sessionId);
  await connection.send("Performance.enable", {}, sessionId);
  await connection.send("HeapProfiler.enable", {}, sessionId);
  await connection.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
  await connection.send("Emulation.setDeviceMetricsOverride", profile.viewport, sessionId);
  await connection.send("Emulation.setCPUThrottlingRate", {
    rate: profile.cpuThrottlingRate,
  }, sessionId);
  await connection.send("Network.setUserAgentOverride", {
    userAgent: profile.userAgent,
  }, sessionId);
  if (profile.network) {
    await connection.send("Network.emulateNetworkConditions", profile.network, sessionId);
  }
  await connection.send("Page.addScriptToEvaluateOnNewDocument", {
    source: perfObserverSource(),
  }, sessionId);
}

async function navigateAndSettle(connection, sessionId, url) {
  const loadPromise = connection
    .waitFor("Page.loadEventFired", sessionId, 5_000)
    .catch(() => null);
  const sameDocumentPromise = connection
    .waitFor("Page.navigatedWithinDocument", sessionId, 5_000)
    .catch(() => null);
  await connection.send("Page.navigate", { url }, sessionId);
  await Promise.race([loadPromise, sameDocumentPromise, sleep(5_000)]);
  await sleep(LCP_SETTLE_MS);
}

function perfObserverSource() {
  return `
    (() => {
      const data = {
        lcp: 0,
        cls: 0,
        longTasks: [],
        events: []
      };
      Object.defineProperty(window, "__qbPerfData", { value: data });
      const observe = (options, callback) => {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) callback(entry);
          });
          observer.observe(options);
        } catch {}
      };
      observe({ type: "largest-contentful-paint", buffered: true }, (entry) => {
        data.lcp = entry.startTime;
      });
      observe({ type: "layout-shift", buffered: true }, (entry) => {
        if (!entry.hadRecentInput) data.cls += entry.value;
      });
      observe({ type: "longtask", buffered: true }, (entry) => {
        data.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      });
      observe({ type: "event", buffered: true, durationThreshold: 16 }, (entry) => {
        data.events.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
      });
    })();
  `;
}

async function openProject(connection, sessionId, id) {
  await evaluate(
    connection,
    sessionId,
    `document.querySelector('[data-open="${id}"]')?.click()`,
  );
  await waitForExpression(
    connection,
    sessionId,
    `document.body.classList.contains('viewer-open') && location.hash === '#${id}'`,
  );
}

async function closeViewer(connection, sessionId) {
  return timeAction(async () => {
    await mouseClick(connection, sessionId, await elementCenter(connection, sessionId, "#back-control"));
    await waitForExpression(
      connection,
      sessionId,
      `document.querySelector('#back-dialog')?.open === true`,
    );
    await mouseClick(
      connection,
      sessionId,
      await elementCenter(connection, sessionId, 'button[value="confirm"]'),
    );
    await waitForExpression(
      connection,
      sessionId,
      `!document.body.classList.contains('viewer-open') && location.hash === ''`,
    );
    await sleep(350);
  });
}

async function closeViewerScripted(connection, sessionId) {
  await evaluate(connection, sessionId, `document.querySelector('#back-control')?.click()`);
  await waitForExpression(
    connection,
    sessionId,
    `document.querySelector('#back-dialog')?.open === true`,
  );
  await evaluate(
    connection,
    sessionId,
    `document.querySelector('button[value="confirm"]')?.click()`,
  );
  await waitForExpression(
    connection,
    sessionId,
    `!document.body.classList.contains('viewer-open') && location.hash === ''`,
  );
  await sleep(350);
}

async function elementCenter(connection, sessionId, selector) {
  const result = await evaluate(connection, sessionId, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    })()
  `);
  if (!result) throw new Error(`Element not found: ${selector}`);
  return result;
}

async function mouseMove(connection, sessionId, { x, y }) {
  await connection.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
  }, sessionId);
}

async function mouseClick(connection, sessionId, { x, y }) {
  await connection.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  }, sessionId);
  await connection.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  }, sessionId);
}

async function waitForExpression(connection, sessionId, expression) {
  const deadline = Date.now() + INTERACTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await evaluate(connection, sessionId, `Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function evaluate(connection, sessionId, expression) {
  const result = await connection.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result.value;
}

async function readPerfData(connection, sessionId) {
  return evaluate(connection, sessionId, `JSON.parse(JSON.stringify(window.__qbPerfData || {}))`);
}

async function readPageChecks(connection, sessionId) {
  return evaluate(connection, sessionId, `
    ({
      cards: document.querySelectorAll("[data-open]").length,
      hash: location.hash,
      frameSrc: document.querySelector("#project-frame")?.getAttribute("src") || "",
      viewerOpen: document.body.classList.contains("viewer-open"),
      projectsJsonRequests: performance.getEntriesByType("resource")
        .filter((entry) => entry.name.endsWith("/projects.json")).length,
      lazyChunks: performance.getEntriesByType("resource")
        .filter((entry) => /(?:viewer|back-control|card-preview)-.*\\.js$/.test(entry.name))
        .map((entry) => entry.name.split("/").pop())
        .sort()
    })
  `);
}

async function sampleHeap(connection, sessionId) {
  await connection.send("HeapProfiler.collectGarbage", {}, sessionId).catch(() => {});
  await sleep(100);
  const usage = await connection.send("Runtime.getHeapUsage", {}, sessionId).catch(() => null);
  const metrics = await connection.send("Performance.getMetrics", {}, sessionId);
  const metricMap = Object.fromEntries(
    metrics.metrics.map((metric) => [metric.name, metric.value]),
  );
  return {
    used: Math.round(usage?.usedSize ?? metricMap.JSHeapUsedSize ?? 0),
    total: Math.round(usage?.totalSize ?? metricMap.JSHeapTotalSize ?? 0),
  };
}

function summarizeVitals(data) {
  return {
    lcpMs: round(data.lcp || 0),
    cls: round(data.cls || 0, 4),
  };
}

function summarizeLongTasks(tasks = []) {
  return {
    count: tasks.length,
    totalMs: round(tasks.reduce((total, task) => total + task.duration, 0)),
    maxMs: round(maxDuration(tasks)),
  };
}

function maxDuration(entries = []) {
  return entries.reduce((max, entry) => Math.max(max, entry.duration || 0), 0);
}

async function timeAction(action) {
  const start = performance.now();
  await action();
  return round(performance.now() - start);
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
  console.log("");
  console.log("Summary");
  console.log(`- build total: ${formatBytes(report.build.totals.raw)} raw, ${formatBytes(report.build.totals.gzip)} gzip, ${formatBytes(report.build.totals.brotli)} brotli`);
  for (const result of report.profiles) {
    console.log(
      `- ${result.profile}: LCP ${result.cwv.lcpMs}ms, CLS ${result.cwv.cls}, ` +
        `preview ${result.runtime.previewMs}ms, open ${result.runtime.openMs}ms, ` +
        `close ${result.runtime.closeMs}ms, heap after close ${formatBytes(result.memory.afterClose.used)}`,
    );
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${round(bytes / 1024)} KiB`;
}
