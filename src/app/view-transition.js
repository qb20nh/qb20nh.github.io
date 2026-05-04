export function runProjectViewTransition(
  oldElement,
  newElement,
  mutate,
  options = {},
) {
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !oldElement ||
    !newElement
  ) {
    mutate();
    options.afterFinished?.();
    return;
  }

  options.beforeStart?.();
  const oldEntries = [
    { element: oldElement, className: "project-view-transition" },
    ...(options.oldElements || []),
  ];
  const newEntries = [
    { element: newElement, className: "project-view-transition" },
    ...(options.newElements || []),
  ];

  addTransitionClasses(oldEntries);
  document.documentElement.classList.toggle(
    "project-view-opening",
    options.direction === "open",
  );
  document.documentElement.classList.toggle(
    "project-view-closing",
    options.direction === "close",
  );
  const transition = document.startViewTransition(() => {
    removeTransitionClasses(oldEntries);
    addTransitionClasses(newEntries);
    mutate();
  });

  transition.finished.finally(() => {
    removeTransitionClasses(oldEntries);
    removeTransitionClasses(newEntries);
    document.documentElement.classList.remove("project-view-opening");
    document.documentElement.classList.remove("project-view-closing");
    options.afterFinished?.();
  });
}

function addTransitionClasses(entries) {
  for (const entry of entries) {
    entry.element?.classList.add(entry.className);
  }
}

function removeTransitionClasses(entries) {
  for (const entry of entries) {
    entry.element?.classList.remove(entry.className);
  }
}
