const PREVIEW_IDLE_UNLOAD_MS = 800;
const PREVIEW_MIN_START_DELAY_MS = 120;
const PREVIEW_MAX_START_DELAY_MS = 1200;
const PREVIEW_DELAY_STEP_MS = 90;
const PREVIEW_DELAY_RECOVERY_MS = 20;
const PREVIEW_FRAME_PRESSURE_MS = 28;
const PREVIEW_LONG_FRAME_MS = 80;
const PREVIEW_MEMORY_PRESSURE_BYTES = 24 * 1024 * 1024;
const PREVIEW_HIGH_MEMORY_RATIO = 0.7;
const PREVIEW_MONITOR_IDLE_MS = 2000;

export function setupCardPreview(directory, getProjectForCard) {
  let activePreview = null;
  let pendingPreviewCard = null;
  let pendingPreviewTimer = 0;
  let previewFrame = null;
  let previewDock = null;
  let previewToken = 0;
  let idleUnloadTimer = 0;
  let warmupRequest = null;
  let suppressFocusPreview = false;
  const pressureMonitor = createPreviewPressureMonitor();

  directory.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;

    suppressFocusPreview = false;
    const card = getEventCard(directory, event.target);
    if (!card || containsRelatedTarget(card, event.relatedTarget)) return;

    queuePreview(card);
  });

  directory.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;

    suppressFocusPreview = false;
    const card = getEventCard(directory, event.target);
    if (!card) return;

    card.focus({ preventScroll: true });
    queuePreview(card);
  });

  directory.addEventListener("pointerout", (event) => {
    const card = getEventCard(directory, event.target);
    if (!card || containsRelatedTarget(card, event.relatedTarget)) return;

    cancelPendingPreview(card);
    stopPreview(card);
  });

  directory.addEventListener("focusin", (event) => {
    if (suppressFocusPreview) return;

    const card = getEventCard(directory, event.target);
    if (card) queuePreview(card);
  });

  directory.addEventListener("focusout", (event) => {
    const card = getEventCard(directory, event.target);
    if (!card || containsRelatedTarget(card, event.relatedTarget)) return;

    cancelPendingPreview(card);
    stopPreview(card);
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") suppressFocusPreview = false;
    },
    true,
  );

  window.addEventListener("resize", () => {
    if (activePreview) updateFrameLayout(activePreview);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopAll();
  });

  function startPreview(card) {
    if (document.body.classList.contains("viewer-open")) return;
    if (activePreview?.card === card) return;

    const project = getProjectForCard(card);
    if (!project?.path) return;

    cancelIdleUnload();
    stopWarmup();
    const layout = getPreviewLayout(card);
    stopActivePreview({ unload: false });

    const frame = getPreviewFrame();
    const path = new URL(project.path, location.href).href;
    activePreview = { card, frame, path, token: previewToken + 1 };
    previewToken = activePreview.token;
    card.classList.add("is-previewing");
    applyFrameLayout(frame, layout);
    frame.hidden = false;
    card.append(frame);

    if (isFrameAtPath(frame, path)) {
      queuePreviewLoaded();
    } else {
      navigateFrame(frame, path);
    }
  }

  function stopPreview(card) {
    if (activePreview?.card !== card) return;
    if (activePreview.isOpening) return;

    stopActivePreview({ unload: false });
    scheduleIdleUnload();
  }

  function stopAll(options = {}) {
    if (options.suppressFocus) suppressFocusPreview = true;
    cancelPendingPreview();
    stopWarmup();
    cancelIdleUnload();
    stopActivePreview({ unload: true });
    pressureMonitor.stop();
  }

  function prepareOpenTransition(card, project) {
    suppressFocusPreview = true;
    cancelPendingPreview();
    stopWarmup();
    cancelIdleUnload();
    pressureMonitor.stop();

    const path = project?.path ? new URL(project.path, location.href).href : "";
    if (
      !activePreview ||
      activePreview.card !== card ||
      activePreview.path !== path ||
      !card.classList.contains("is-preview-loaded") ||
      !isFrameAtPath(activePreview.frame, path)
    ) {
      stopActivePreview({ unload: true });
      return null;
    }

    const preview = activePreview;
    preview.isOpening = true;

    return {
      sourceElement: preview.frame,
      release() {
        if (activePreview === preview) {
          activePreview = null;
        }

        preview.card.classList.remove("is-previewing", "is-preview-loaded");
        releasePreviewFrame(preview.frame);
      },
    };
  }

  function stopActivePreview({ unload }) {
    if (activePreview) {
      activePreview.card.classList.remove("is-previewing", "is-preview-loaded");
      activePreview = null;
    }

    if (!previewFrame) return;

    parkPreviewFrame();

    if (unload) {
      navigateFrame(previewFrame, "about:blank");
    }
  }

  function getPreviewFrame() {
    if (previewFrame) return previewFrame;

    previewFrame = document.createElement("iframe");
    previewFrame.className = "project-preview-frame";
    previewFrame.loading = "eager";
    previewFrame.hidden = true;
    previewFrame.tabIndex = -1;
    previewFrame.setAttribute("aria-hidden", "true");
    previewFrame.setAttribute(
      "allow",
      "autoplay 'none'; microphone 'none'; camera 'none'",
    );
    previewFrame.addEventListener("load", () => {
      if (
        activePreview?.frame === previewFrame &&
        activePreview.token === previewToken &&
        isFrameAtPath(previewFrame, activePreview.path)
      ) {
        queuePreviewLoaded();
      }
    });

    return previewFrame;
  }

  function queuePreviewLoaded() {
    const preview = activePreview;
    if (!preview) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (
          activePreview === preview &&
          preview.token === previewToken &&
          isFrameAtPath(preview.frame, preview.path)
        ) {
          preview.card.classList.add("is-preview-loaded");
        }
      });
    });
  }

  function queuePreview(card) {
    if (document.body.classList.contains("viewer-open")) return;
    if (activePreview?.card === card) return;

    const project = getProjectForCard(card);
    if (!project?.path) return;

    pendingPreviewCard = card;
    pressureMonitor.wake();
    if (pressureMonitor.canWarm()) warmProject(project.path);
    window.clearTimeout(pendingPreviewTimer);
    pendingPreviewTimer = window.setTimeout(() => {
      pendingPreviewTimer = 0;
      if (pendingPreviewCard === card) {
        pendingPreviewCard = null;
        pressureMonitor.notePreviewNavigation();
        startPreview(card);
      }
    }, pressureMonitor.getDelay());
  }

  function cancelPendingPreview(card = pendingPreviewCard) {
    if (card && pendingPreviewCard !== card) return;

    pendingPreviewCard = null;
    window.clearTimeout(pendingPreviewTimer);
    pendingPreviewTimer = 0;
    stopWarmup();
    if (!activePreview) pressureMonitor.restSoon();
  }

  function parkPreviewFrame() {
    previewFrame.hidden = true;
    getPreviewDock().append(previewFrame);
  }

  function getPreviewDock() {
    if (previewDock && directory.contains(previewDock)) return previewDock;

    previewDock = document.createElement("div");
    previewDock.className = "project-preview-dock";
    directory.append(previewDock);
    return previewDock;
  }

  function scheduleIdleUnload() {
    cancelIdleUnload();
    idleUnloadTimer = window.setTimeout(() => {
      idleUnloadTimer = 0;
      if (!activePreview && previewFrame) {
        pressureMonitor.notePreviewUnload();
        navigateFrame(previewFrame, "about:blank");
      }
    }, PREVIEW_IDLE_UNLOAD_MS);
  }

  function cancelIdleUnload() {
    if (!idleUnloadTimer) return;

    window.clearTimeout(idleUnloadTimer);
    idleUnloadTimer = 0;
  }

  function warmProject(path) {
    const href = new URL(path, location.href).href;
    if (warmupRequest?.href === href) return;

    stopWarmup();

    const controller = new AbortController();
    warmupRequest = { href, controller };
    fetch(href, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .catch(() => {})
      .finally(() => {
        if (warmupRequest?.controller === controller) {
          warmupRequest = null;
        }
      });
  }

  function stopWarmup() {
    if (!warmupRequest) return;

    warmupRequest.controller.abort();
    warmupRequest = null;
  }

  return { prepareOpenTransition, stopAll };
}

function createPreviewPressureMonitor() {
  let delay = PREVIEW_MIN_START_DELAY_MS;
  let frameAverage = 16.7;
  let longFrameScore = 0;
  let lastFrameTime = 0;
  let lastAdjustmentTime = 0;
  let frameRequest = 0;
  let monitoring = false;
  let idleTimer = 0;
  let longTaskObserver = null;
  let heapLowWater = readHeapUsed();

  function scheduleMonitorFrame() {
    if (!monitoring || frameRequest || document.hidden) return;

    frameRequest = window.requestAnimationFrame(monitorFrame);
  }

  function monitorFrame(now) {
    frameRequest = 0;

    if (lastFrameTime) {
      const frameTime = now - lastFrameTime;

      if (frameTime < 250) {
        frameAverage = frameAverage * 0.9 + frameTime * 0.1;
        longFrameScore =
          frameTime > PREVIEW_LONG_FRAME_MS
            ? Math.min(8, longFrameScore + 1)
            : Math.max(0, longFrameScore - 0.08);
      }
    }

    lastFrameTime = now;

    if (now - lastAdjustmentTime >= 500) {
      lastAdjustmentTime = now;
      adjustDelay();
    }

    scheduleMonitorFrame();
  }

  function startLongTaskObserver() {
    if (
      longTaskObserver ||
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes?.includes("longtask")
    ) {
      return;
    }

    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longFrameScore = Math.min(
          8,
          longFrameScore + Math.max(1, entry.duration / PREVIEW_LONG_FRAME_MS),
        );
      }

      adjustDelay();
    });

    longTaskObserver.observe({ entryTypes: ["longtask"] });
  }

  document.addEventListener("visibilitychange", () => {
    lastFrameTime = 0;
    if (document.hidden) {
      stop();
      return;
    }

    scheduleMonitorFrame();
  });

  function adjustDelay() {
    const heap = readHeap();
    if (heap.used && (!heapLowWater || heap.used < heapLowWater)) {
      heapLowWater = heap.used;
    }

    const heapGrowth =
      heap.used && heapLowWater ? heap.used - heapLowWater : 0;
    const highHeapRatio =
      heap.used && heap.limit ? heap.used / heap.limit > PREVIEW_HIGH_MEMORY_RATIO : false;
    const framePressure =
      frameAverage > PREVIEW_FRAME_PRESSURE_MS || longFrameScore >= 2;
    const memoryPressure =
      heapGrowth > PREVIEW_MEMORY_PRESSURE_BYTES || highHeapRatio;

    if (framePressure || memoryPressure) {
      delay = Math.min(
        PREVIEW_MAX_START_DELAY_MS,
        delay +
          (frameAverage > PREVIEW_LONG_FRAME_MS || highHeapRatio
            ? PREVIEW_DELAY_STEP_MS * 2
            : PREVIEW_DELAY_STEP_MS),
      );
      return;
    }

    delay = Math.max(
      PREVIEW_MIN_START_DELAY_MS,
      delay - PREVIEW_DELAY_RECOVERY_MS,
    );
  }

  return {
    wake() {
      start();
    },
    restSoon() {
      if (!monitoring || idleTimer) return;

      idleTimer = window.setTimeout(() => {
        idleTimer = 0;
        stop();
      }, PREVIEW_MONITOR_IDLE_MS);
    },
    stop,
    canWarm() {
      start();
      return delay <= PREVIEW_MIN_START_DELAY_MS * 2 && longFrameScore < 1;
    },
    getDelay() {
      start();
      adjustDelay();
      return delay;
    },
    notePreviewNavigation() {
      start();
      const used = readHeapUsed();
      if (used && (!heapLowWater || used < heapLowWater)) heapLowWater = used;
    },
    notePreviewUnload() {
      adjustDelay();
      this.restSoon();
    },
  };

  function start() {
    window.clearTimeout(idleTimer);
    idleTimer = 0;

    if (monitoring) return;

    monitoring = true;
    lastFrameTime = 0;
    scheduleMonitorFrame();
    startLongTaskObserver();
  }

  function stop() {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    monitoring = false;
    lastFrameTime = 0;

    if (frameRequest) {
      window.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    }

    longTaskObserver?.disconnect();
    longTaskObserver = null;
  }
}

function updateFrameLayout({ card, frame }) {
  applyFrameLayout(frame, getPreviewLayout(card));
}

function getPreviewLayout(card) {
  const cardRect = card.getBoundingClientRect();
  const layoutWidth = Math.max(window.innerWidth, cardRect.width);
  const scale = cardRect.width / layoutWidth;
  const layoutHeight = Math.max(window.innerHeight, cardRect.height / scale);

  return { layoutWidth, layoutHeight, scale };
}

function applyFrameLayout(frame, { layoutWidth, layoutHeight, scale }) {
  frame.style.width = `${layoutWidth}px`;
  frame.style.height = `${layoutHeight}px`;
  frame.style.transform = `scale(${scale})`;
}

function isFrameAtPath(frame, path) {
  try {
    const current = frame.contentWindow.location;
    const expected = new URL(path, location.href);
    return (
      current.origin === expected.origin &&
      current.pathname === expected.pathname &&
      current.search === expected.search
    );
  } catch {
    return false;
  }
}

function navigateFrame(frame, path) {
  try {
    frame.contentWindow.location.replace(new URL(path, location.href).href);
  } catch {
    frame.src = path;
  }
}

function releasePreviewFrame(frame) {
  frame.hidden = true;
  frame.removeAttribute("style");
  navigateFrame(frame, "about:blank");
  frame.remove();
}

function readHeapUsed() {
  return readHeap().used;
}

function readHeap() {
  const memory = performance.memory;

  return {
    used: Number.isFinite(memory?.usedJSHeapSize)
      ? memory.usedJSHeapSize
      : 0,
    limit: Number.isFinite(memory?.jsHeapSizeLimit)
      ? memory.jsHeapSizeLimit
      : 0,
  };
}

function getEventCard(directory, target) {
  const card = target.closest?.(".project-card");
  return card && directory.contains(card) ? card : null;
}

function containsRelatedTarget(card, relatedTarget) {
  return relatedTarget instanceof Node && card.contains(relatedTarget);
}
