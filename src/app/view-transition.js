export function runProjectViewTransition(oldElement, newElement, mutate) {
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !oldElement ||
    !newElement
  ) {
    mutate();
    return;
  }

  oldElement.classList.add("project-view-transition");
  const transition = document.startViewTransition(() => {
    oldElement.classList.remove("project-view-transition");
    newElement.classList.add("project-view-transition");
    mutate();
  });

  transition.finished.finally(() => {
    oldElement.classList.remove("project-view-transition");
    newElement.classList.remove("project-view-transition");
  });
}
