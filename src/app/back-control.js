export function setupBackControl(backControl, onBack) {
  let dragState = null;
  let suppressClick = false;

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

    onBack();
  });

  return { placeBackControl };
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
