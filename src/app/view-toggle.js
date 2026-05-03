export function setupViewToggle(buttons, onChange) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      buttons.forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.view === view));
      });
      onChange(view);
    });
  });
}
