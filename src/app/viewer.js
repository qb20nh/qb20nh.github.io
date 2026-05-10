import { confirmProjectClose } from "./dialog.js";
import {
  applyTransitionFrameClip,
  clearTransitionFrameClip,
  getPreviewLayout,
} from "./card-preview.js";
import { readVisibleViewport } from "./viewport.js";
import { runProjectViewTransition } from "./view-transition.js";

const FRAME_REVEAL_FADE_MS = 220;
const FRAME_DOM_READY_TIMEOUT_MS = 4000;

export function createProjectViewer({
  viewer,
  frame,
  backControl,
  backDialog,
  getProjectById,
  findProjectCard,
  placeBackControl,
  beforeOpenProject = () => {},
}) {
  let activeProject = null;
  let pendingBackConfirmation = null;
  let retainedPreviewTransition = null;
  let isOpeningTransition = false;
  let viewportSizeUpdate = 0;
  let frameNavigationRequest = 0;
  let frameRevealRequest = 0;
  const surfaceTransitionTarget = createTransitionTarget(
    viewer,
    "project-surface-target",
  );

  syncViewerSize();
  window.addEventListener("resize", queueViewerSizeSync);
  window.visualViewport?.addEventListener("resize", queueViewerSizeSync);

  function openProject(project, options = {}) {
    const sourceCard = options.sourceCard || findProjectCard(project);
    let openViewport = readVisibleViewport();
    const previewTransition = options.skipTransition
      ? null
      : beforeOpenProject(project, sourceCard, openViewport);
    const openWithoutTransition = options.skipTransition || !sourceCard;

    if (openWithoutTransition) {
      openViewport = lockPageScroll();
      syncViewerSize(openViewport);
      document.body.classList.add("viewer-open");
      placeBackControl();
      backControl.classList.add("is-visible");
      mountFrameInViewer();
      replaceFrameLocation(frame, project.path);
      applyOpenProject(project, { ...options, skipFrameNavigation: true });
      return;
    }

    syncViewerSize(openViewport);
    document.body.classList.add("viewer-open");
    placeBackControl();
    let revealRequest = 0;
    let keepsLoadedPreviewFrame = false;
    let needsFrameNavigation = false;
    const startsWithoutLoadedPreviewFrame = !previewTransition?.hasLoadedPreviewFrame;
    const emptyFrameTransition = startsWithoutLoadedPreviewFrame
      ? prepareOpenEmptyFrameTransition(sourceCard)
      : null;

    isOpeningTransition = true;
    runProjectViewTransition(
      previewTransition?.sourceElement || sourceCard,
      viewer,
      () => {
        const hasLoadedPreviewFrame = Boolean(
          previewTransition?.hasLoadedPreviewFrame,
        );
        keepsLoadedPreviewFrame = Boolean(
          hasLoadedPreviewFrame &&
            previewTransition?.mountLoadedFrame?.(openViewport),
        );

        if (!keepsLoadedPreviewFrame) mountFrameInViewer();
        if (!hasLoadedPreviewFrame) {
          revealRequest = holdFrameUntilReady();
        }
        applyOpenProject(project, {
          ...options,
          deferBackControl: true,
          skipFrameMount: keepsLoadedPreviewFrame,
          skipFrameNavigation: true,
        });
        emptyFrameTransition?.expand(viewer);
        if (!hasLoadedPreviewFrame) {
          needsFrameNavigation = true;
        }
      },
      {
        direction: "open",
        beforeStart() {
          openViewport = lockPageScroll();
          previewTransition?.activate?.();
          emptyFrameTransition?.activate();
        },
        afterReady() {
          previewTransition?.hideLiveSource?.();
          emptyFrameTransition?.hideLiveTarget();
        },
        oldElements: [
          {
            element: document.documentElement,
            className: "project-page-transition",
          },
          ...getPreviewTransitionElements(previewTransition),
          ...(emptyFrameTransition?.oldElements || []),
        ],
        newElements: [
          ...(previewTransition?.sourceSurface
            ? [
                {
                  element: surfaceTransitionTarget,
                  className: "project-surface-transition",
                },
                ...(previewTransition.sourceFrame
                  ? [
                      {
                        element: frame,
                        className: "project-frame-transition",
                      },
                    ]
                  : []),
              ]
            : []),
          ...(emptyFrameTransition?.newElements || []),
        ],
        afterFinished: () => {
          isOpeningTransition = false;
          syncViewerSize();
          placeBackControl();

          if (activeProject === project) {
            backControl.classList.add("is-visible");
          }

          retainedPreviewTransition = keepsLoadedPreviewFrame
            ? previewTransition
            : null;
          previewTransition?.release({ keepFrame: keepsLoadedPreviewFrame });
          emptyFrameTransition?.cleanup();
          if (needsFrameNavigation) {
            queueFrameNavigation(project);
          }
          if (revealRequest) {
            revealFrameWhenReady(project, revealRequest);
          }
        },
      },
    );
  }

  function applyOpenProject(project, options = {}) {
    syncViewerSize();
    activeProject = project;
    frame.title = `${project.name} preview`;
    if (!options.skipFrameMount) mountFrameInViewer();
    viewer.classList.add("is-open");
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("viewer-open");
    placeBackControl();
    if (!options.deferBackControl) {
      backControl.classList.add("is-visible");
    }

    if (options.updateHistory && location.hash !== `#${project.id}`) {
      history.pushState({ projectId: project.id }, "", `#${project.id}`);
    }

    if (!options.skipFrameNavigation) replaceFrameLocation(frame, project.path);
  }

  function queueFrameNavigation(project) {
    const request = ++frameNavigationRequest;

    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (request !== frameNavigationRequest || activeProject !== project) {
          return;
        }

        replaceFrameLocation(frame, project.path);
      }, 0);
    });
  }

  function holdFrameUntilReady() {
    const request = ++frameRevealRequest;

    viewer.classList.add("is-holding-frame");
    viewer.classList.remove("is-frame-ready");
    return request;
  }

  async function revealFrameWhenReady(project, request) {
    await waitForFrameDomReady(frame, project.path, request);

    if (request !== frameRevealRequest || activeProject !== project) return;

    viewer.classList.add("is-frame-ready");
    window.setTimeout(() => {
      if (request !== frameRevealRequest || activeProject !== project) return;

      viewer.classList.remove("is-holding-frame", "is-frame-ready");
    }, FRAME_REVEAL_FADE_MS);
  }

  function closeProject(options = {}) {
    frameNavigationRequest += 1;
    frameRevealRequest += 1;
    const project = activeProject;
    const targetCard = project ? findProjectCard(project) : null;

    const closeFrameTransition = prepareCloseFrameTransition(targetCard, frame);

    runProjectViewTransition(
      viewer,
      targetCard,
      () => {
        applyCloseProject(options);
      },
      {
        direction: "close",
        oldElements: closeFrameTransition?.oldElements || [],
        newElements: closeFrameTransition?.newElements || [],
        afterFinished: () => {
          closeFrameTransition?.cleanup();
          if (!activeProject) unlockPageScroll();
        },
      },
    );
  }

  function applyCloseProject(options = {}) {
    frameNavigationRequest += 1;
    frameRevealRequest += 1;
    const retainedPreview = retainedPreviewTransition;
    retainedPreviewTransition = null;
    activeProject = null;
    mountFrameInViewer();
    if (retainedPreview) {
      retainedPreview.releaseLoadedFrame();
    }
    viewer.classList.remove("is-holding-frame", "is-frame-ready");
    viewer.classList.remove("is-open");
    viewer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("viewer-open");
    backControl.classList.remove("is-visible");
    replaceFrameLocation(frame, "about:blank");

    if (options.updateHistory && location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function mountFrameInViewer() {
    viewer.append(frame);
    frame.hidden = false;
    frame.classList.remove("project-preview-frame");
    frame.removeAttribute("style");
    frame.removeAttribute("aria-hidden");
    frame.removeAttribute("tabindex");
  }

  function lockPageScroll() {
    const scrollbarGutter = readScrollbarGutter();
    document.body.style.setProperty(
      "--page-scrollbar-gutter",
      `${scrollbarGutter}px`,
    );
    document.documentElement.classList.add("viewer-scroll-locked");
    document.body.classList.add("viewer-scroll-locked");
    const viewport = readViewerViewport();
    syncViewerSize(viewport);
    placeBackControl();
    return viewport;
  }

  function unlockPageScroll() {
    document.documentElement.classList.remove("viewer-scroll-locked");
    document.body.classList.remove("viewer-scroll-locked");
    document.body.style.removeProperty("--page-scrollbar-gutter");
  }

  function queueViewerSizeSync() {
    if (isOpeningTransition) return;
    if (viewportSizeUpdate) return;

    viewportSizeUpdate = window.requestAnimationFrame(() => {
      viewportSizeUpdate = 0;
      syncViewerSize();
      placeBackControl();
    });
  }

  function readViewerViewport() {
    return readVisibleViewport({
      includeScrollbarGutter: document.documentElement.classList.contains(
        "viewer-scroll-locked",
      ),
    });
  }

  function syncViewerSize(viewport = readViewerViewport()) {
    viewer.style.setProperty("--viewer-left", `${viewport.left}px`);
    viewer.style.setProperty("--viewer-top", `${viewport.top}px`);
    viewer.style.setProperty("--viewer-width", `${viewport.width}px`);
    viewer.style.setProperty("--viewer-height", `${viewport.height}px`);
  }

  function requestProjectClose(options = {}) {
    if (!activeProject) {
      closeProject(options);
      return;
    }

    if (pendingBackConfirmation) return;

    const project = activeProject;
    pendingBackConfirmation = confirmProjectClose(backDialog).then((confirmed) => {
      pendingBackConfirmation = null;

      if (confirmed) {
        closeProject({ updateHistory: options.updateHistory });
        return;
      }

      if (
        options.restoreOnCancel &&
        activeProject === project &&
        location.hash !== `#${project.id}`
      ) {
        history.pushState({ projectId: project.id }, "", `#${project.id}`);
      }
    });
  }

  function syncProjectFromLocation() {
    const id = location.hash.replace("#", "");
    if (!id) {
      if (activeProject) {
        requestProjectClose({ updateHistory: false, restoreOnCancel: true });
        return;
      }

      closeProject({ updateHistory: false });
      return;
    }

    const project = getProjectById(id);
    if (!project) return;

    if (project !== activeProject) openProject(project, { skipTransition: true });
  }

  return {
    openProject,
    requestProjectClose,
    syncProjectFromLocation,
  };
}

function getPreviewTransitionElements(previewTransition) {
  if (!previewTransition?.sourceSurface) return [];

  const elements = [
    {
      element: previewTransition.sourceSurface,
      className: "project-surface-transition",
    },
  ];

  if (previewTransition.sourceFrame) {
    elements.push({
      element: previewTransition.sourceFrame,
      className: "project-frame-transition",
    });
  }

  return elements;
}

function prepareOpenEmptyFrameTransition(sourceCard) {
  if (!sourceCard) return null;

  const target = document.createElement("div");
  target.className = "project-open-frame-target";
  target.hidden = true;
  target.setAttribute("aria-hidden", "true");
  document.body.append(target);

  return {
    oldElements: [{ element: target, className: "project-frame-transition" }],
    newElements: [{ element: target, className: "project-frame-transition" }],
    activate() {
      const rect = sourceCard.getBoundingClientRect();
      const sourceStyle = getComputedStyle(sourceCard);

      Object.assign(target.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: sourceStyle.borderRadius,
      });
      target.hidden = false;
    },
    expand(viewer) {
      const rect = viewer.getBoundingClientRect();

      Object.assign(target.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: "0px",
      });
    },
    hideLiveTarget() {
      target.style.visibility = "hidden";
    },
    cleanup() {
      target.remove();
    },
  };
}

function prepareCloseFrameTransition(targetCard, frame) {
  if (!targetCard) return null;

  const layout = getPreviewLayout(targetCard);
  const cardRect = targetCard.getBoundingClientRect();
  const target = document.createElement("div");

  target.className = "project-close-frame-target";
  target.setAttribute("aria-hidden", "true");
  Object.assign(target.style, {
    position: "fixed",
    left: `${cardRect.left + layout.offsetX}px`,
    top: `${cardRect.top + layout.offsetY}px`,
    width: `${layout.surfaceWidth}px`,
    height: `${layout.surfaceHeight}px`,
    opacity: "0",
    pointerEvents: "none",
    contain: "layout paint",
  });
  document.body.append(target);
  applyTransitionFrameClip(targetCard, target);

  return {
    oldElements: [{ element: frame, className: "project-frame-transition" }],
    newElements: [{ element: target, className: "project-frame-transition" }],
    cleanup() {
      target.remove();
      clearTransitionFrameClip();
    },
  };
}

function replaceFrameLocation(frame, url) {
  frame.src = new URL(url, location.href).href;
}

function readScrollbarGutter() {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function createTransitionTarget(viewer, className) {
  const target = document.createElement("div");
  target.className = className;
  target.setAttribute("aria-hidden", "true");
  viewer.append(target);
  return target;
}

function waitForFrameDomReady(frame, url, revealRequest) {
  const expected = new URL(url, location.href);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolveReady, FRAME_DOM_READY_TIMEOUT_MS);

    frame.addEventListener("load", checkReady);
    checkReady();

    function checkReady() {
      if (isFrameDomReady(frame, expected)) {
        resolveReady();
      }
    }

    function resolveReady() {
      window.clearTimeout(timeout);
      frame.removeEventListener("load", checkReady);

      resolve(revealRequest);
    }
  });
}

function isFrameDomReady(frame, expected) {
  try {
    const current = frame.contentWindow.location;
    return (
      current.origin === expected.origin &&
      current.pathname === expected.pathname &&
      current.search === expected.search &&
      frame.contentDocument?.readyState !== "loading"
    );
  } catch {
    return false;
  }
}
