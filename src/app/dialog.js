const DIALOG_CLOSE_ANIMATION_MS = 140;

export function confirmProjectClose(dialog) {
  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(window.confirm("Go back to directory?"));
  }

  return new Promise((resolve) => {
    const form = dialog.querySelector('form[method="dialog"]');
    let closeTimer = 0;
    let isClosing = false;

    const handleClose = () => {
      cleanup();
      resolve(dialog.returnValue === "confirm");
    };
    const handleSubmit = (event) => {
      event.preventDefault();
      closeWithAnimation(event.submitter?.value || "");
    };
    const handleCancel = (event) => {
      event.preventDefault();
      closeWithAnimation("cancel");
    };

    function closeWithAnimation(value) {
      if (isClosing) return;

      isClosing = true;
      dialog.returnValue = value;
      dialog.classList.add("is-closing");

      const closeDelay = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? 0
        : DIALOG_CLOSE_ANIMATION_MS;
      closeTimer = window.setTimeout(() => {
        dialog.close(value);
      }, closeDelay);
    }

    function cleanup() {
      window.clearTimeout(closeTimer);
      form?.removeEventListener("submit", handleSubmit);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.classList.remove("is-closing");
    }

    dialog.returnValue = "";
    dialog.classList.remove("is-closing");
    form?.addEventListener("submit", handleSubmit);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose, { once: true });
    dialog.showModal();
  });
}
