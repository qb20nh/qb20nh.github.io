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
}) {
  let activeProject = null;
  let pendingBackConfirmation = null;

  function openProject(project, options = {}) {
    const sourceCard = options.sourceCard || findProjectCard(project);
    runProjectViewTransition(sourceCard, viewer, () => {
      applyOpenProject(project, options);
    });
  }

  function applyOpenProject(project, options = {}) {
    activeProject = project;
    frame.title = `${project.name} preview`;
    viewer.classList.add("is-open");
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("viewer-open");
    backControl.classList.add("is-visible");
    placeBackControl();

    if (options.updateHistory && location.hash !== `#${project.id}`) {
      history.pushState({ projectId: project.id }, "", `#${project.id}`);
    }

    replaceFrameLocation(frame, project.path);
  }

  function closeProject(options = {}) {
    const project = activeProject;
    const targetCard = project ? findProjectCard(project) : null;
    runProjectViewTransition(viewer, targetCard, () => {
      applyCloseProject(options);
    });
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
