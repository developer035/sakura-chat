/** True when the user asked the OS/browser to minimise motion. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Scroll behavior that respects prefers-reduced-motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** Duration (ms) for animated viewport moves; 0 when motion is reduced. */
export function viewportDuration(ms = 400): number {
  return prefersReducedMotion() ? 0 : ms;
}
