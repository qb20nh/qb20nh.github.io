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
  let viewportSizeUpdate = 0;
  let frameNavigationRequest = 0;
  const frameTransitionTarget = createFrameTransitionTarget(viewer);

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
      replaceFrameLocation(frame, project.path);
      applyOpenProject(project, { ...options, skipFrameNavigation: true });
      lockPageScroll();
      return;
    }

    syncViewerSize();
    document.body.classList.add("viewer-open");
    placeBackControl();
    backControl.classList.add("is-visible");

    runProjectViewTransition(
      previewTransition?.sourceElement || sourceCard,
      viewer,
      () => {
        if (previewTransition?.sourceFrame) {
          viewer.classList.add("is-revealing-frame");
        }

        applyOpenProject(project, { ...options, skipFrameNavigation: true });
        queueFrameNavigation(project);
      },
      {
        direction: "open",
        beforeStart: previewTransition?.activate,
        oldElements: getPreviewTransitionElements(previewTransition),
        newElements: previewTransition?.sourceFrame
          ? [
              {
                element: frameTransitionTarget,
                className: "project-frame-transition",
              },
            ]
          : [],
        afterFinished: () => {
          if (activeProject === project) {
            lockPageScroll();
          }

          previewTransition?.release();
          viewer.classList.remove("is-revealing-frame");
        },
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

  function closeProject(options = {}) {
    frameNavigationRequest += 1;
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
    frameNavigationRequest += 1;
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

    if (project !== activeProject) openProject(project, { skipTransition: true });
  }

  return {
    openProject,
    requestProjectClose,
    syncProjectFromLocation,
  };
}

function getPreviewTransitionElements(previewTransition) {
  if (!previewTransition?.sourceFrame) return [];

  return [
    {
      element: previewTransition.sourceFrame,
      className: "project-frame-transition",
    },
  ];
}

function replaceFrameLocation(frame, url) {
  try {
    frame.contentWindow.location.replace(url);
  } catch {
    frame.src = url;
  }
}

function createFrameTransitionTarget(viewer) {
  const target = document.createElement("div");
  target.className = "project-frame-target";
  target.setAttribute("aria-hidden", "true");
  viewer.append(target);
  return target;
}
