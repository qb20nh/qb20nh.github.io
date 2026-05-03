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

  const fromRect = oldElement.getBoundingClientRect();

  oldElement.classList.add("project-view-transition");
  document.documentElement.classList.toggle(
    "project-view-opening",
    options.direction === "open",
  );
  const transition = document.startViewTransition(() => {
    oldElement.classList.remove("project-view-transition");
    newElement.classList.add("project-view-transition");
    mutate();

    if (options.direction === "open") {
      setOpeningTransitionGeometry(fromRect, newElement.getBoundingClientRect());
    }
  });

  transition.finished.finally(() => {
    oldElement.classList.remove("project-view-transition");
    newElement.classList.remove("project-view-transition");
    document.documentElement.classList.remove("project-view-opening");
    clearOpeningTransitionGeometry();
    options.afterFinished?.();
  });
}

function setOpeningTransitionGeometry(fromRect, toRect) {
  if (!fromRect.width || !toRect.width || !toRect.height) return;

  const rootStyle = document.documentElement.style;
  const scale = fromRect.width / toRect.width;

  rootStyle.setProperty("--project-vt-from-left", `${fromRect.left}px`);
  rootStyle.setProperty("--project-vt-from-top", `${fromRect.top}px`);
  rootStyle.setProperty("--project-vt-to-left", `${toRect.left}px`);
  rootStyle.setProperty("--project-vt-to-top", `${toRect.top}px`);
  rootStyle.setProperty("--project-vt-to-width", `${toRect.width}px`);
  rootStyle.setProperty("--project-vt-to-height", `${toRect.height}px`);
  rootStyle.setProperty("--project-vt-open-scale", String(scale));
}

function clearOpeningTransitionGeometry() {
  const rootStyle = document.documentElement.style;

  rootStyle.removeProperty("--project-vt-from-left");
  rootStyle.removeProperty("--project-vt-from-top");
  rootStyle.removeProperty("--project-vt-to-left");
  rootStyle.removeProperty("--project-vt-to-top");
  rootStyle.removeProperty("--project-vt-to-width");
  rootStyle.removeProperty("--project-vt-to-height");
  rootStyle.removeProperty("--project-vt-open-scale");
}
