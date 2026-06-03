const APP_SCROLL_SELECTORS = [
  "[data-app-scroll-root]",
  "[data-form-scroll-root]",
  "[data-mda-scroll]",
] as const;

export const scrollToAppTop = (behavior: ScrollBehavior = "auto") => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const scrollOnce = () => {
    window.scrollTo({ top: 0, left: 0, behavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    APP_SCROLL_SELECTORS.forEach((selector) => {
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.scrollTo({ top: 0, left: 0, behavior });
        el.scrollTop = 0;
      });
    });
  };

  scrollOnce();
  requestAnimationFrame(scrollOnce);
  window.setTimeout(scrollOnce, 80);
};