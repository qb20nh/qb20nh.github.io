export function setupBackControl(backControl, onBack) {
  const edgeInset = -8;
  const dragInset = 8;
  let dragState = null;
  let suppressClick = false;

  function placeBackControl() {
    const saved = getSavedBackPosition();
    const width = backControl.offsetWidth || 44;
    const height = backControl.offsetHeight || 44;
    const rightEdge = getSafeRightEdge();
    const side = saved && saved.side === "right" ? "right" : "left";
    const top = clamp(
      saved && Number.isFinite(saved.top) ? saved.top : 18,
      8,
      window.innerHeight - height - 8,
    );
    const left = side === "right" ? rightEdge - width - edgeInset : edgeInset;

    setBackControlSide(side);
    backControl.style.left = `${left}px`;
    backControl.style.top = `${top}px`;
  }

  function snapBackControl() {
    const rect = backControl.getBoundingClientRect();
    const rightEdge = getSafeRightEdge();
    const side = rect.left + rect.width / 2 < rightEdge / 2 ? "left" : "right";
    const left = side === "left" ? edgeInset : rightEdge - rect.width - edgeInset;
    const top = clamp(rect.top, 8, window.innerHeight - rect.height - 8);

    setBackControlSide(side);
    backControl.style.left = `${left}px`;
    backControl.style.top = `${top}px`;
    saveBackPosition(side, top);
  }

  backControl.addEventListener("pointerdown", (event) => {
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
    backControl.classList.add("is-tooltip-visible");
    backControl.setPointerCapture(event.pointerId);
  });

  backControl.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const width = backControl.offsetWidth;
    const height = backControl.offsetHeight;
    const rightEdge = getSafeRightEdge();
    const nextLeft = clamp(
      event.clientX - dragState.offsetX,
      dragInset,
      rightEdge - width - dragInset,
    );
    const nextTop = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - height - 8);
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);

    if (distance > 4) dragState.moved = true;
    setBackControlSide(
      nextLeft + width / 2 < rightEdge / 2 ? "left" : "right",
    );
    backControl.style.left = `${nextLeft}px`;
    backControl.style.top = `${nextTop}px`;
  });

  backControl.addEventListener("pointerup", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    suppressClick = dragState.moved;
    backControl.classList.remove("is-dragging");
    backControl.classList.remove("is-tooltip-visible");
    backControl.releasePointerCapture(event.pointerId);

    if (dragState.moved) snapBackControl();
    dragState = null;
  });

  backControl.addEventListener("pointercancel", () => {
    if (!dragState) return;
    backControl.classList.remove("is-dragging");
    backControl.classList.remove("is-tooltip-visible");
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

    onBack();
  });

  return { placeBackControl };

  function getSafeRightEdge() {
    if (
      document.body.classList.contains("viewer-open") ||
      document.body.classList.contains("viewer-scroll-locked")
    ) {
      return window.innerWidth;
    }

    return window.innerWidth - getRightScrollbarInset();
  }

  function setBackControlSide(side) {
    backControl.dataset.side = side;
    document.documentElement.classList.toggle(
      "back-control-side-right",
      side === "right",
    );
    document.documentElement.classList.toggle(
      "back-control-side-left",
      side !== "right",
    );
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getRightScrollbarInset() {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
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
