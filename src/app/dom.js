export function getDomElements() {
  return {
    directory: document.querySelector("#directory"),
    viewer: document.querySelector("#viewer"),
    frame: document.querySelector("#project-frame"),
    backControl: document.querySelector("#back-control"),
    backDialog: document.querySelector("#back-dialog"),
    toggleButtons: Array.from(document.querySelectorAll("[data-view]")),
  };
}
