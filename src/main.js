import "./styles.css";

const directory = document.querySelector("#directory");
const viewer = document.querySelector("#viewer");
const frame = document.querySelector("#project-frame");
const backControl = document.querySelector("#back-control");
const toggleButtons = Array.from(document.querySelectorAll("[data-view]"));

let projects = [];
let projectById = new Map();
let currentView = "grid";
let activeProject = null;
let dragState = null;
let suppressClick = false;

function renderProjects() {
  directory.className = `directory ${currentView}`;
  directory.innerHTML = projects.map(projectTemplate).join("");
}

async function loadProjects() {
  const response = await fetch("/projects.json");
  projects = await response.json();
  projectById = new Map(projects.map((project) => [project.id, project]));
  renderProjects();
  syncProjectFromLocation();
}

function projectTemplate(project) {
  return `
    <article class="project-card">
      <div class="project-main">
        <h2 class="project-name">${escapeHtml(project.name)}</h2>
        <span class="badge">${escapeHtml(project.badge)}</span>
        <p class="project-description">${escapeHtml(project.description)}</p>
      </div>
      <div class="project-actions">
        <a class="action open" href="${escapeAttribute(project.path)}" data-open="${escapeHtml(project.id)}">
          Open
        </a>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function setView(view) {
  currentView = view;
  toggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
  renderProjects();
}

function openProject(project, options = {}) {
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

  replaceFrameLocation(project.path);
}

function closeProject(options = {}) {
  activeProject = null;
  viewer.classList.remove("is-open");
  viewer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("viewer-open");
  backControl.classList.remove("is-visible");
  replaceFrameLocation("about:blank");
  frame.removeAttribute("src");

  if (options.updateHistory && location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function syncProjectFromLocation() {
  const id = location.hash.replace("#", "");
  if (!id) {
    closeProject({ updateHistory: false });
    return;
  }

  const project = projectById.get(id);
  if (!project) return;

  if (project !== activeProject) openProject(project);
}

function replaceFrameLocation(url) {
  try {
    frame.contentWindow.location.replace(url);
  } catch {
    frame.src = url;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSavedBackPosition() {
  try {
    return JSON.parse(localStorage.getItem("qb20nh.back-control") || "null");
  } catch {
    return null;
  }
}

function saveBackPosition(side, top) {
  try {
    localStorage.setItem("qb20nh.back-control", JSON.stringify({ side, top }));
  } catch {
    // Position persistence is optional.
  }
}

function placeBackControl() {
  const saved = getSavedBackPosition();
  const edgeInset = -8;
  const width = backControl.offsetWidth || 44;
  const height = backControl.offsetHeight || 44;
  const side = saved && saved.side === "right" ? "right" : "left";
  const top = clamp(
    saved && Number.isFinite(saved.top) ? saved.top : 18,
    8,
    window.innerHeight - height - 8,
  );
  const left = side === "right" ? window.innerWidth - width - edgeInset : edgeInset;

  backControl.dataset.side = side;
  backControl.style.left = `${left}px`;
  backControl.style.top = `${top}px`;
}

function snapBackControl() {
  const edgeInset = -8;
  const rect = backControl.getBoundingClientRect();
  const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
  const left = side === "left" ? edgeInset : window.innerWidth - rect.width - edgeInset;
  const top = clamp(rect.top, 8, window.innerHeight - rect.height - 8);

  backControl.dataset.side = side;
  backControl.style.left = `${left}px`;
  backControl.style.top = `${top}px`;
  saveBackPosition(side, top);
}

directory.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open]");
  if (!trigger) return;
  event.preventDefault();
  const project = projectById.get(trigger.dataset.open);
  if (project) openProject(project, { updateHistory: true });
});

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

backControl.addEventListener("pointerdown", (event) => {
  if (!activeProject) return;

  const rect = backControl.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
  };

  backControl.classList.add("is-dragging");
  backControl.setPointerCapture(event.pointerId);
});

backControl.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const width = backControl.offsetWidth;
  const height = backControl.offsetHeight;
  const nextLeft = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - width - 8);
  const nextTop = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - height - 8);
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);

  if (distance > 4) dragState.moved = true;
  backControl.style.left = `${nextLeft}px`;
  backControl.style.top = `${nextTop}px`;
});

backControl.addEventListener("pointerup", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  suppressClick = dragState.moved;
  backControl.classList.remove("is-dragging");
  backControl.releasePointerCapture(event.pointerId);

  if (dragState.moved) snapBackControl();
  dragState = null;
});

backControl.addEventListener("pointercancel", () => {
  if (!dragState) return;
  backControl.classList.remove("is-dragging");
  snapBackControl();
  dragState = null;
  suppressClick = true;
});

backControl.addEventListener("click", (event) => {
  if (suppressClick) {
    event.preventDefault();
    suppressClick = false;
    return;
  }

  closeProject({ updateHistory: true });
});

window.addEventListener("resize", () => {
  if (activeProject) placeBackControl();
});

window.addEventListener("popstate", syncProjectFromLocation);
window.addEventListener("hashchange", syncProjectFromLocation);

loadProjects();
