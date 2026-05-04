import { confirmProjectClose } from "./dialog.js";
import {
  applyTransitionFrameClip,
  clearTransitionFrameClip,
  getPreviewLayout,
} from "./card-preview.js";
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
    const previewTransition = options.skipTransition
      ? null
      : beforeOpenProject(project, sourceCard);
    const openWithoutTransition = options.skipTransition || !sourceCard;

    if (openWithoutTransition) {
      syncViewerSize();
      document.body.classList.add("viewer-open");
      placeBackControl();
      backControl.classList.add("is-visible");
      mountFrameInViewer();
      replaceFrameLocation(frame, project.path);
      applyOpenProject(project, { ...options, skipFrameNavigation: true });
      lockPageScroll();
      return;
    }

    syncViewerSize();
    document.body.classList.add("viewer-open");
    placeBackControl();
    let revealRequest = 0;
    let keepsLoadedPreviewFrame = false;

    runProjectViewTransition(
      previewTransition?.sourceElement || sourceCard,
      viewer,
      () => {
        const hasLoadedPreviewFrame = Boolean(
          previewTransition?.hasLoadedPreviewFrame,
        );
        keepsLoadedPreviewFrame = Boolean(
          hasLoadedPreviewFrame && previewTransition?.mountLoadedFrame?.(),
        );

        lockPageScroll();
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
        if (!hasLoadedPreviewFrame) {
          queueFrameNavigation(project);
        }
      },
      {
        direction: "open",
        beforeStart: previewTransition?.activate,
        oldElements: getPreviewTransitionElements(previewTransition),
        newElements: previewTransition?.sourceSurface
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
          : [],
        afterFinished: () => {
          if (activeProject === project) {
            backControl.classList.add("is-visible");
          }

          retainedPreviewTransition = keepsLoadedPreviewFrame
            ? previewTransition
            : null;
          previewTransition?.release({ keepFrame: keepsLoadedPreviewFrame });
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
        restorePageGutter();
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
    if (retainedPreview) {
      retainedPreview.releaseLoadedFrame({ unload: true });
    } else {
      mountFrameInViewer();
    }
    viewer.classList.remove("is-holding-frame", "is-frame-ready");
    viewer.classList.remove("is-open");
    viewer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("viewer-open");
    backControl.classList.remove("is-visible");
    if (!retainedPreview) {
      replaceFrameLocation(frame, "about:blank");
      frame.removeAttribute("src");
    }

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
    document.documentElement.classList.add("viewer-scroll-locked");
    document.body.classList.add("viewer-scroll-locked");
    syncViewerSize();
    placeBackControl();
  }

  function unlockPageScroll() {
    document.body.classList.remove("viewer-scroll-locked");
    restorePageGutter();
  }

  function restorePageGutter() {
    document.documentElement.classList.remove("viewer-scroll-locked");
  }

  function queueViewerSizeSync() {
    if (viewportSizeUpdate) return;

    viewportSizeUpdate = window.requestAnimationFrame(() => {
      viewportSizeUpdate = 0;
      syncViewerSize();
    });
  }

  function syncViewerSize() {
    viewer.style.setProperty("--viewer-width", `${window.innerWidth}px`);
    viewer.style.setProperty("--viewer-height", `${window.innerHeight}px`);
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
    let frameRequest = 0;
    const timeout = window.setTimeout(resolveReady, FRAME_DOM_READY_TIMEOUT_MS);

    checkReady();

    function checkReady() {
      if (isFrameDomReady(frame, expected)) {
        resolveReady();
        return;
      }

      frameRequest = window.requestAnimationFrame(checkReady);
    }

    function resolveReady() {
      window.clearTimeout(timeout);
      if (frameRequest) {
        window.cancelAnimationFrame(frameRequest);
      }

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
