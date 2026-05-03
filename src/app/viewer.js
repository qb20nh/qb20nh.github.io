import { confirmProjectClose } from "./dialog.js";
import { runProjectViewTransition } from "./view-transition.js";

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
  let openRequestId = 0;
  let viewportSizeUpdate = 0;

  syncViewerSize();
  window.addEventListener("resize", queueViewerSizeSync);
  window.visualViewport?.addEventListener("resize", queueViewerSizeSync);

  function openProject(project, options = {}) {
    const sourceCard = options.sourceCard || findProjectCard(project);
    const previewTransition = beforeOpenProject(project, sourceCard);
    const requestId = ++openRequestId;

    syncViewerSize();
    prepareFrameForOpen(frame, project.path, true).then(
      (frameReady) => {
        if (requestId !== openRequestId) {
          previewTransition?.release();
          return;
        }

        document.body.classList.add("viewer-open");
        placeBackControl();
        backControl.classList.add("is-visible");

        runProjectViewTransition(
          previewTransition?.sourceElement || sourceCard,
          viewer,
          () => {
            applyOpenProject(project, { ...options, frameReady });
          },
          {
            direction: "open",
            afterFinished: () => {
              if (activeProject === project) {
                lockPageScroll();
              }

              previewTransition?.release();
            },
          },
        );
      },
    );
  }

  function applyOpenProject(project, options = {}) {
    syncViewerSize();
    activeProject = project;
    frame.title = `${project.name} preview`;
    viewer.classList.add("is-open");
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("viewer-open");
    placeBackControl();
    backControl.classList.add("is-visible");

    if (options.updateHistory && location.hash !== `#${project.id}`) {
      history.pushState({ projectId: project.id }, "", `#${project.id}`);
    }

    if (!options.frameReady) replaceFrameLocation(frame, project.path);
  }

  function closeProject(options = {}) {
    openRequestId += 1;
    const project = activeProject;
    const targetCard = project ? findProjectCard(project) : null;
    runProjectViewTransition(
      viewer,
      targetCard,
      () => {
        restorePageGutter();
        applyCloseProject(options);
      },
      {
        direction: "close",
        afterFinished: () => {
          if (!activeProject) unlockPageScroll();
        },
      },
    );
  }

  function applyCloseProject(options = {}) {
    activeProject = null;
    viewer.classList.remove("is-open");
    viewer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("viewer-open");
    backControl.classList.remove("is-visible");
    replaceFrameLocation(frame, "about:blank");
    frame.removeAttribute("src");

    if (options.updateHistory && location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
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

    if (project !== activeProject) openProject(project);
  }

  return {
    openProject,
    requestProjectClose,
    syncProjectFromLocation,
  };
}

function replaceFrameLocation(frame, url) {
  try {
    frame.contentWindow.location.replace(url);
  } catch {
    frame.src = url;
  }
}

function prepareFrameForOpen(frame, url, shouldWait) {
  if (!shouldWait) return Promise.resolve(false);

  replaceFrameLocation(frame, url);

  if (isFrameReadyAtUrl(frame, url)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer = 0;

    const settle = () => {
      if (settled) return;

      settled = true;
      window.clearTimeout(fallbackTimer);
      frame.removeEventListener("load", settle);
      resolve(isFrameReadyAtUrl(frame, url));
    };

    frame.addEventListener("load", settle, { once: true });
    fallbackTimer = window.setTimeout(settle, 1400);
  });
}

function isFrameReadyAtUrl(frame, url) {
  try {
    const current = frame.contentWindow.location;
    const expected = new URL(url, location.href);

    return (
      current.origin === expected.origin &&
      current.pathname === expected.pathname &&
      current.search === expected.search &&
      frame.contentDocument.readyState !== "loading"
    );
  } catch {
    return false;
  }
}
