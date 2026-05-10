import "./styles/theme.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/controls.css";
import "./styles/projects.css";
import "./styles/viewer.css";
import "./styles/dialog.css";
import "./styles/responsive.css";
import { getDomElements } from "./app/dom.js";
import {
  createProjectCardMap,
  createProjectMap,
  findProjectCard,
  loadProjects,
  readProjectsFromDirectory,
  readProjectFromTrigger,
  renderProjects,
} from "./app/projects.js";

const elements = getDomElements();
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

if (LOCAL_HOSTNAMES.has(location.hostname)) {
  document.documentElement.classList.add("is-localhost");
}

let projects = null;
let projectById = new Map();
let projectCardById = new Map();
let projectByCard = new WeakMap();
const emptyCardPreview = createEmptyCardPreview();
let cardPreview = emptyCardPreview;
let cardPreviewPromise = null;
let viewer = null;
let viewerPromise = null;
let backControl = { placeBackControl() {} };
let requestProjectClose = () => {};

elements.directory.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-open]");
  if (!trigger) return;

  event.preventDefault();
  const project = getProjectFromTrigger(trigger);
  if (!project) return;

  try {
    const projectViewer = await loadProjectViewer();
    projectViewer.openProject(project, {
      sourceCard: trigger.closest(".project-card"),
      updateHistory: true,
    });
  } catch (error) {
    console.error("Failed to load project viewer", error);
  }
});

elements.directory.addEventListener("pointerover", bootstrapCardPreview, {
  passive: true,
});
elements.directory.addEventListener("pointerdown", bootstrapCardPreview, {
  passive: true,
});
elements.directory.addEventListener("focusin", bootstrapCardPreview);

function bootstrapCardPreview(event) {
  if (cardPreviewPromise) return;

  void loadProjectViewer();
  const intent = readPreviewIntent(event);
  if (!intent) return;

  void loadCardPreview().then((preview) => {
    if (!shouldKeepPreviewIntent(intent)) return;

    if (intent.source === "touch") {
      intent.card.focus({ preventScroll: true });
    }
    preview.previewCard(intent.card, intent.source);
  });
}

function readPreviewIntent(event) {
  const card = event.target.closest?.(".project-card");
  if (!card || !elements.directory.contains(card)) return null;

  if (event.type === "pointerover") {
    if (event.pointerType === "touch") return null;
    if (containsRelatedTarget(card, event.relatedTarget)) return null;
    return { card, source: "pointer" };
  }

  if (event.type === "pointerdown") {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return null;
    return { card, source: "touch" };
  }

  return { card, source: "focus" };
}

function shouldKeepPreviewIntent({ card, source }) {
  if (!document.contains(card)) return false;
  if (source === "pointer") return card.matches(":hover");
  if (source === "focus") return card.matches(":focus-within");
  return true;
}

function containsRelatedTarget(card, relatedTarget) {
  return relatedTarget instanceof Node && card.contains(relatedTarget);
}

async function loadCardPreview() {
  if (cardPreview !== emptyCardPreview) return cardPreview;

  if (!cardPreviewPromise) {
    cardPreviewPromise = import("./app/card-preview.js")
      .then(({ setupCardPreview }) => {
        cardPreview = setupCardPreview(
          elements.directory,
          elements.frame,
          (card) => getProjectFromCard(card),
        );
        return cardPreview;
      })
      .catch((error) => {
        cardPreviewPromise = null;
        throw error;
      });
  }

  return cardPreviewPromise;
}

async function loadProjectViewer() {
  if (viewer) return viewer;

  if (!viewerPromise) {
    viewerPromise = Promise.all([
      import("./app/back-control.js"),
      import("./app/viewer.js"),
      loadCardPreview(),
    ])
      .then(([{ setupBackControl }, { createProjectViewer }, projectPreview]) => {
        cardPreview = projectPreview;
        backControl = setupBackControl(elements.backControl, () => {
          requestProjectClose({ updateHistory: true });
        });
        viewer = createProjectViewer({
          viewer: elements.viewer,
          frame: elements.frame,
          backControl: elements.backControl,
          backDialog: elements.backDialog,
          getProjectById: (id) => projectById.get(id),
          findProjectCard: (project) =>
            projectCardById.get(project.id) ||
            findProjectCard(elements.directory, project),
          placeBackControl: backControl.placeBackControl,
          beforeOpenProject: (project, sourceCard, viewport) =>
            cardPreview.prepareOpenTransition(sourceCard, project, viewport),
        });
        requestProjectClose = viewer.requestProjectClose;
        return viewer;
      })
      .catch((error) => {
        viewerPromise = null;
        throw error;
      });
  }

  return viewerPromise;
}

async function syncProjectFromLocation() {
  if (!location.hash && !viewer) return;

  try {
    const projectViewer = await loadProjectViewer();
    projectViewer.syncProjectFromLocation();
  } catch (error) {
    console.error("Failed to sync project viewer", error);
  }
}

function getProjectFromCard(card) {
  const cachedProject = projectByCard.get(card);
  if (cachedProject) return cachedProject;

  const trigger = card.querySelector("[data-open]");
  return trigger ? getProjectFromTrigger(trigger) : null;
}

function getProjectFromTrigger(trigger) {
  return projectById.get(trigger.dataset.open) || readProjectFromTrigger(trigger);
}

function setProjects(nextProjects) {
  projects = nextProjects;
  projectById = createProjectMap(projects);
  refreshProjectCardIndex();
}

function refreshProjectCardIndex() {
  projectCardById = createProjectCardMap(elements.directory);
  projectByCard = new WeakMap();
  for (const project of projects || []) {
    const card = projectCardById.get(project.id);
    if (card) projectByCard.set(card, project);
  }
}

function createEmptyCardPreview() {
  return {
    prepareOpenTransition() {
      return null;
    },
    previewCard() {},
    stopAll() {},
  };
}

function hasPrerenderedProjects() {
  return elements.directory.querySelector("[data-open]") !== null;
}

function syncPrerenderedProjects() {
  const prerenderedProjects = readProjectsFromDirectory(elements.directory);
  if (!prerenderedProjects.length) return false;

  setProjects(prerenderedProjects);
  return true;
}

window.addEventListener("popstate", syncProjectFromLocation);
window.addEventListener("hashchange", syncProjectFromLocation);

async function init() {
  if (!hasPrerenderedProjects()) {
    setProjects(await loadProjects());
    renderDirectory();
  } else {
    syncPrerenderedProjects();
  }

  syncProjectFromLocation();
}

function renderDirectory() {
  cardPreview.stopAll();

  if (!projects) {
    elements.directory.className = "directory grid";
    projectCardById = new Map();
    projectByCard = new WeakMap();
    return;
  }

  renderProjects(elements.directory, projects);
  refreshProjectCardIndex();
}

init();
