export function readVisibleViewport({ includeScrollbarGutter = false } = {}) {
  const viewport = window.visualViewport;
  const width = includeScrollbarGutter
    ? window.innerWidth
    : viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const left = includeScrollbarGutter ? 0 : viewport?.offsetLeft || 0;
  const top = viewport?.offsetTop || 0;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    left: Math.round(left),
    top: Math.round(top),
  };
}
