import { escapeAttribute, escapeHtml } from "./html.js";

export async function loadProjects() {
  const response = await fetch("/projects.json");
  if (!response.ok) {
    throw new Error(`Failed to load projects.json: ${response.status}`);
  }

  return response.json();
}

export function renderProjects(directory, projects, view) {
  directory.className = `directory ${view}`;
  directory.innerHTML = projects.map(projectTemplate).join("");
}

export function createProjectMap(projects) {
  return new Map(projects.map((project) => [project.id, project]));
}

export function findProjectCard(directory, project) {
  return (
    Array.from(directory.querySelectorAll("[data-open]"))
      .find((trigger) => trigger.dataset.open === project.id)
      ?.closest(".project-card") || null
  );
}

function projectTemplate(project) {
  return `
    <article class="project-card">
      <div class="project-main">
        <div class="project-header">
          <h2 class="project-name">${escapeHtml(project.name)}</h2>
          <span class="badge">${escapeHtml(project.badge)}</span>
        </div>
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
