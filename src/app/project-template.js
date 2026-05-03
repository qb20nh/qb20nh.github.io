import { escapeAttribute, escapeHtml } from "./html.js";

export function renderProjectCards(projects) {
  return projects.map(projectTemplate).join("");
}

export function projectTemplate(project) {
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
