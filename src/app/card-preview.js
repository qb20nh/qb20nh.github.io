const PREVIEW_FADE_OUT_MS = 240;
const PREVIEW_MIN_START_DELAY_MS = 120;
const PREVIEW_MAX_START_DELAY_MS = 1200;
const PREVIEW_DELAY_STEP_MS = 90;
const PREVIEW_DELAY_RECOVERY_MS = 20;
const PREVIEW_FRAME_PRESSURE_MS = 28;
const PREVIEW_LONG_FRAME_MS = 80;
const PREVIEW_MEMORY_PRESSURE_BYTES = 24 * 1024 * 1024;
const PREVIEW_HIGH_MEMORY_RATIO = 0.7;
const PREVIEW_MONITOR_IDLE_MS = 2000;

export function setupCardPreview(directory, previewFrame, getProjectForCard) {
  let activePreview = null;
  let pendingPreviewCard = null;
  let pendingPreviewTimer = 0;
  let previewClip = null;
  let previewSurface = null;
  let transitionShell = null;
  let previewDock = null;
  let previewToken = 0;
  let fadeOutTimer = 0;
  let fadingPreview = null;
  let previewLayoutUpdate = 0;
  let suppressFocusPreview = false;
  const resourceHints = new Set();
  const pressureMonitor = createPreviewPressureMonitor();

  previewFrame.addEventListener("load", () => {
    if (
      activePreview?.frame === previewFrame &&
      activePreview.token === previewToken &&
      isFrameAtPath(previewFrame, activePreview.path)
    ) {
      queuePreviewLoaded();
    }
  });

  directory.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;

    suppressFocusPreview = false;
    const card = getEventCard(directory, event.target);
    if (!card || containsRelatedTarget(card, event.relatedTarget)) return;

    queuePreview(card, primeCardResources(card));
  });

  directory.addEventListener("pointerdown", (event) => {
    suppressFocusPreview = false;
    const card = getEventCard(directory, event.target);
    if (!card) return;

    const project = primeCardResources(card);
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;

    card.focus({ preventScroll: true });
    queuePreview(card, project);
  });

  directory.addEventListener("pointerout", (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") return;

    const card = getEventCard(directory, event.target);
    if (!card || containsRelatedTarget(card, event.relatedTarget)) return;

    cancelPendingPreview(card);
    stopPreview(card);
  });

  directory.addEventListener("focusin", (event) => {
    if (suppressFocusPreview) return;

    const card = getEventCard(directory, event.target);
    if (card) queuePreview(card, primeCardResources(card));
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

  window.addEventListener("resize", queuePreviewLayoutUpdate);
  window.visualViewport?.addEventListener("resize", queuePreviewLayoutUpdate);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopAll();
  });

  function startPreview(card) {
    if (document.body.classList.contains("viewer-open")) return;
    if (activePreview?.card === card) return;

    const project = getProjectForCard(card);
    if (!project?.path) return;

    primeProjectResources(project.path);
    stopActivePreview({ fade: false });
    cancelPreviewFadeOut();

    const frame = getPreviewFrame();
    const clip = getPreviewClip();
    const surface = getPreviewSurface();
    const path = new URL(project.path, location.href).href;
    activePreview = { card, clip, surface, frame, path, token: previewToken + 1 };
    previewToken = activePreview.token;
    card.classList.add("is-previewing");
    clip.hidden = false;
    frame.hidden = false;
    card.append(clip);
    updateFrameLayout(activePreview);

    if (isFrameAtPath(frame, path)) {
      queuePreviewLoaded();
    } else {
      navigateFrame(frame, path);
    }
  }

  function stopPreview(card) {
    if (activePreview?.card !== card) return;
    if (activePreview.isOpening) return;

    stopActivePreview({ fade: true });
  }

  function stopAll(options = {}) {
    if (options.suppressFocus) suppressFocusPreview = true;
    cancelPendingPreview();
    cancelPreviewFadeOut();
    stopActivePreview({ fade: false });
    pressureMonitor.stop();
  }

  function prepareOpenTransition(card, project) {
    suppressFocusPreview = true;
    cancelPendingPreview();
    pressureMonitor.stop();

    const path = project?.path ? new URL(project.path, location.href).href : "";
    const preview =
      activePreview &&
      activePreview.card === card &&
      activePreview.path === path &&
      card.classList.contains("is-preview-loaded") &&
      isFrameAtPath(activePreview.frame, path)
        ? activePreview
        : null;

    if (activePreview && activePreview !== preview) {
      stopActivePreview({ fade: false });
    }

    if (preview) preview.isOpening = true;
    transitionShell = createTransitionShell(card);

    return {
      sourceElement: transitionShell,
      sourceSurface: card,
      sourceFrame: preview?.surface || null,
      hasLoadedPreviewFrame: Boolean(preview),
      mountLoadedFrame() {
        if (!preview) return false;

        preview.card.classList.add("is-frame-host");
        preview.clip.hidden = false;
        preview.frame.hidden = false;
        preview.frame.removeAttribute("aria-hidden");
        preview.frame.removeAttribute("tabindex");
        return true;
      },
      activate() {
        positionTransitionShell(transitionShell, card);
        transitionShell.hidden = false;
        card.classList.add("is-transition-source");
        if (preview) applyTransitionFrameClip(card, preview.surface);
      },
      release(options = {}) {
        if (preview && activePreview === preview) {
          activePreview = null;
        }

        card.classList.remove("is-transition-source");
        clearTransitionFrameClip();
        transitionShell?.remove();
        transitionShell = null;

        if (preview) {
          preview.isOpening = false;
          card.classList.remove("is-previewing", "is-preview-loaded");

          if (!options.keepFrame) {
            releasePreviewFrame(preview.frame, {
              clip: preview.clip,
              surface: preview.surface,
            });
          }
        }
      },
      releaseLoadedFrame() {
        if (!preview) return;

        preview.card.classList.remove(
          "is-frame-host",
          "is-previewing",
          "is-preview-loaded",
          "is-transition-source",
        );
        preview.isOpening = false;
        releasePreviewFrame(preview.frame, {
          clip: preview.clip,
          surface: preview.surface,
        });
      },
    };
  }

  function stopActivePreview({ fade }) {
    const preview = activePreview;

    if (preview) {
      preview.card.classList.remove("is-preview-loaded");
      activePreview = null;

      if (fade && preview.clip.parentElement === preview.card) {
        schedulePreviewFadeOut(preview);
        return;
      }

      preview.card.classList.remove("is-previewing");
    }

    if (!previewClip?.contains(previewFrame)) return;

    parkPreviewFrame();
    unloadFrame(previewFrame);
  }

  function getPreviewFrame() {
    const surface = getPreviewSurface();
    previewFrame.classList.add("project-preview-frame");
    previewFrame.hidden = true;
    previewFrame.tabIndex = -1;
    previewFrame.setAttribute("aria-hidden", "true");
    surface.append(previewFrame);
    return previewFrame;
  }

  function getPreviewClip() {
    if (previewClip) return previewClip;

    previewClip = document.createElement("div");
    previewClip.className = "project-preview-clip";
    previewClip.hidden = true;
    return previewClip;
  }

  function getPreviewSurface() {
    if (previewSurface) return previewSurface;

    previewSurface = document.createElement("div");
    previewSurface.className = "project-preview-surface";
    getPreviewClip().append(previewSurface);
    return previewSurface;
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

  function queuePreview(card, project = primeCardResources(card)) {
    if (document.body.classList.contains("viewer-open")) return;
    if (activePreview?.card === card) return;
    if (!project?.path) return;

    pendingPreviewCard = card;
    pressureMonitor.wake();
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
    if (!activePreview) pressureMonitor.restSoon();
  }

  function parkPreviewFrame() {
    if (!previewClip) return;

    previewClip.hidden = true;
    if (previewClip.contains(previewFrame)) {
      previewFrame.hidden = true;
    }
    getPreviewDock().append(previewClip);
  }

  function schedulePreviewFadeOut(preview) {
    cancelPreviewFadeOut();

    fadingPreview = preview;
    fadeOutTimer = window.setTimeout(finishPreviewFadeOut, PREVIEW_FADE_OUT_MS);
  }

  function finishPreviewFadeOut() {
    if (!fadingPreview) return;

    const preview = fadingPreview;
    cancelPreviewFadeOut();

    if (activePreview?.frame === preview.frame) return;

    preview.card.classList.remove("is-previewing");

    if (previewFrame !== preview.frame) return;

    parkPreviewFrame();
    unloadFrame(previewFrame);
  }

  function cancelPreviewFadeOut() {
    window.clearTimeout(fadeOutTimer);
    fadeOutTimer = 0;

    if (!fadingPreview) return;

    fadingPreview.card.classList.remove("is-previewing");
    fadingPreview = null;
  }

  function queuePreviewLayoutUpdate() {
    if (!activePreview || previewLayoutUpdate) return;

    previewLayoutUpdate = window.requestAnimationFrame(() => {
      previewLayoutUpdate = 0;
      if (activePreview) updateFrameLayout(activePreview);
    });
  }

  function getPreviewDock() {
    if (previewDock && document.body.contains(previewDock)) return previewDock;

    previewDock = document.createElement("div");
    previewDock.className = "project-preview-dock";
    document.body.append(previewDock);
    return previewDock;
  }

  function primeCardResources(card) {
    const project = getProjectForCard(card);
    if (project?.path) primeProjectResources(project.path);
    return project;
  }

  function primeProjectResources(path) {
    const url = new URL(path, location.href);

    if (url.origin !== location.origin) {
      appendResourceHint(`preconnect:${url.origin}`, {
        rel: "preconnect",
        href: url.origin,
        crossOrigin: "anonymous",
      });
    }

    appendResourceHint(`preload:${url.href}`, {
      rel: "preload",
      href: url.href,
      as: "document",
      fetchPriority: "high",
    });
  }

  function appendResourceHint(key, attrs) {
    if (resourceHints.has(key)) return;

    const link = document.createElement("link");
    link.dataset.previewHint = "";
    link.rel = attrs.rel;
    link.href = attrs.href;
    if (attrs.as) link.as = attrs.as;
    if (attrs.crossOrigin) link.crossOrigin = attrs.crossOrigin;
    if (attrs.fetchPriority) link.fetchPriority = attrs.fetchPriority;
    document.head.append(link);
    resourceHints.add(key);
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

function updateFrameLayout({ card, clip, surface, frame }) {
  applyFrameLayout(surface, frame, getPreviewLayout(clip || card));
}

function createTransitionShell(card) {
  const shell = document.createElement("div");
  shell.className = "project-transition-card";
  shell.hidden = true;
  shell.setAttribute("aria-hidden", "true");

  const main = card.querySelector(".project-main")?.cloneNode(true);
  const actions = card.querySelector(".project-actions")?.cloneNode(true);

  if (main) shell.append(main);
  if (actions) shell.append(actions);
  document.body.append(shell);

  return shell;
}

function positionTransitionShell(shell, card) {
  const rect = card.getBoundingClientRect();
  const cardStyle = getComputedStyle(card);

  shell.style.left = `${rect.left}px`;
  shell.style.top = `${rect.top}px`;
  shell.style.width = `${rect.width}px`;
  shell.style.height = `${rect.height}px`;
  shell.style.padding = cardStyle.padding;
  shell.style.gap = cardStyle.gap;
  shell.style.borderRadius = cardStyle.borderRadius;
}

export function getPreviewLayout(card) {
  const cardRect = card.getBoundingClientRect();
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const scale = Math.max(
    cardRect.width / viewportWidth,
    cardRect.height / viewportHeight,
  );
  const surfaceWidth = viewportWidth * scale;
  const surfaceHeight = viewportHeight * scale;
  const offsetX = (cardRect.width - surfaceWidth) / 2;
  const offsetY = (cardRect.height - surfaceHeight) / 2;

  return {
    viewportWidth,
    viewportHeight,
    clipWidth: cardRect.width,
    clipHeight: cardRect.height,
    surfaceWidth,
    surfaceHeight,
    offsetX,
    offsetY,
    scale,
  };
}

function applyFrameLayout(
  surface,
  frame,
  {
    viewportWidth,
    viewportHeight,
    surfaceWidth,
    surfaceHeight,
    offsetX,
    offsetY,
    scale,
  },
) {
  surface.style.width = `${surfaceWidth}px`;
  surface.style.height = `${surfaceHeight}px`;
  surface.style.left = `${offsetX}px`;
  surface.style.top = `${offsetY}px`;
  frame.style.width = `${viewportWidth}px`;
  frame.style.height = `${viewportHeight}px`;
  frame.style.transform = `scale(${scale})`;
}

export function applyTransitionFrameClip(clipElement, surface) {
  const clipRect = clipElement.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty(
    "--project-frame-clip-top",
    toClipPixels(clipRect.top - surfaceRect.top),
  );
  rootStyle.setProperty(
    "--project-frame-clip-right",
    toClipPixels(surfaceRect.right - clipRect.right),
  );
  rootStyle.setProperty(
    "--project-frame-clip-bottom",
    toClipPixels(surfaceRect.bottom - clipRect.bottom),
  );
  rootStyle.setProperty(
    "--project-frame-clip-left",
    toClipPixels(clipRect.left - surfaceRect.left),
  );
}

export function clearTransitionFrameClip() {
  const rootStyle = document.documentElement.style;

  rootStyle.removeProperty("--project-frame-clip-top");
  rootStyle.removeProperty("--project-frame-clip-right");
  rootStyle.removeProperty("--project-frame-clip-bottom");
  rootStyle.removeProperty("--project-frame-clip-left");
}

function toClipPixels(value) {
  return `${Math.max(0, value)}px`;
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
  frame.src = new URL(path, location.href).href;
}

function releasePreviewFrame(frame, options = {}) {
  const surface =
    options.surface ||
    (frame.parentElement?.classList.contains("project-preview-surface")
      ? frame.parentElement
      : null);
  const clip =
    options.clip ||
    (surface?.parentElement?.classList.contains("project-preview-clip")
      ? surface.parentElement
      : null);

  frame.classList.remove("project-preview-frame");
  frame.removeAttribute("style");
  frame.removeAttribute("aria-hidden");
  frame.removeAttribute("tabindex");

  if (!clip) {
    return;
  }

  if (clip.contains(frame)) {
    frame.hidden = true;
    document.body.append(frame);
  }
  surface.removeAttribute("style");
  clip.hidden = true;
  clip.removeAttribute("style");
  clip.remove();
}

function unloadFrame(frame) {
  navigateFrame(frame, "about:blank");
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
