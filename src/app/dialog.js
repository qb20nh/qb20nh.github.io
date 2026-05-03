export function confirmProjectClose(dialog) {
  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(window.confirm("Go back to directory?"));
  }

  return new Promise((resolve) => {
    const handleClose = () => {
      resolve(dialog.returnValue === "confirm");
    };

    dialog.returnValue = "";
    dialog.addEventListener("close", handleClose, { once: true });
    dialog.showModal();
  });
}
