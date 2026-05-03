import { renderProjectCards } from "./project-template.js";

export async function loadProjects() {
  const response = await fetch("/projects.json");
  if (!response.ok) {
    throw new Error(`Failed to load projects.json: ${response.status}`);
  }

  return response.json();
}

export function renderProjects(directory, projects, view) {
  directory.className = `directory ${view}`;
  directory.innerHTML = renderProjectCards(projects);
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

export function readProjectFromTrigger(trigger) {
  const card = trigger.closest(".project-card");
  const id = trigger.dataset.open;
  const path = trigger.getAttribute("href");
  if (!card || !id || !path) return null;

  return {
    id,
    path,
    name: card.querySelector(".project-name")?.textContent?.trim() || id,
    badge: card.querySelector(".badge")?.textContent?.trim() || "",
    description:
      card.querySelector(".project-description")?.textContent?.trim() || "",
  };
}
