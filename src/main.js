import "./styles.css";
import { setupBackControl } from "./app/back-control.js";
import { getDomElements } from "./app/dom.js";
import {
  createProjectMap,
  findProjectCard,
  loadProjects,
  readProjectFromTrigger,
  renderProjects,
} from "./app/projects.js";
import { createProjectViewer } from "./app/viewer.js";
import { setupViewToggle } from "./app/view-toggle.js";

const elements = getDomElements();

let projects = null;
let projectById = new Map();
let currentView = "grid";
let requestProjectClose = () => {};

const backControl = setupBackControl(elements.backControl, () => {
  requestProjectClose({ updateHistory: true });
});

const viewer = createProjectViewer({
  viewer: elements.viewer,
  frame: elements.frame,
  backControl: elements.backControl,
  backDialog: elements.backDialog,
  getProjectById: (id) => projectById.get(id),
  findProjectCard: (project) => findProjectCard(elements.directory, project),
  placeBackControl: backControl.placeBackControl,
});

requestProjectClose = viewer.requestProjectClose;

setupViewToggle(elements.toggleButtons, (view) => {
  currentView = view;
  renderDirectory();
});

elements.directory.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open]");
  if (!trigger) return;

  event.preventDefault();
  const project =
    projectById.get(trigger.dataset.open) || readProjectFromTrigger(trigger);
  if (!project) return;

  viewer.openProject(project, {
    sourceCard: trigger.closest(".project-card"),
    updateHistory: true,
  });
});

window.addEventListener("resize", () => {
  backControl.placeBackControl();
});

window.addEventListener("popstate", viewer.syncProjectFromLocation);
window.addEventListener("hashchange", viewer.syncProjectFromLocation);

async function init() {
  projects = await loadProjects();
  projectById = createProjectMap(projects);
  renderDirectory();
  viewer.syncProjectFromLocation();
}

function renderDirectory() {
  if (!projects) {
    elements.directory.className = `directory ${currentView}`;
    return;
  }

  renderProjects(elements.directory, projects, currentView);
}

init();
