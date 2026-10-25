import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Always-visible, draggable vertical scroll indicator. Android/iOS browsers
 * hide native scrollbars, so this draws its own colourful thumb.
 * Pass a ref to the scroll container, or omit it to follow the page.
 */
const ScrollRail = ({ target }: { target?: RefObject<HTMLElement> }) => {
  const [m, setM] = useState({ top: 0, size: 0, show: false, offset: 0, height: 0, right: 2 });
  const drag = useRef<{ y: number; start: number } | null>(null);

  const el = () => target?.current || (document.scrollingElement as HTMLElement | null);

  useEffect(() => {
    const node = target?.current;
    const src: HTMLElement | Window = node || window;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const e = el();
        if (!e) return;
         const bounds = node?.getBoundingClientRect();
         const offset = Math.max(0, bounds?.top || 0);
         const view = Math.min(node ? e.clientHeight : window.innerHeight, window.innerHeight - offset);
        const total = e.scrollHeight;
         if (view <= 0 || total <= e.clientHeight + 4) return setM((p) => (p.show ? { ...p, show: false } : p));
         const size = Math.min(view, Math.max(44, (e.clientHeight / total) * view));
         const top = Math.min(1, Math.max(0, e.scrollTop / (total - e.clientHeight))) * (view - size);
         setM({ top, size, show: true, offset, height: view, right: Math.max(2, window.innerWidth - (bounds?.right || window.innerWidth) + 2) });
      });
    };
    measure();
    src.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    const content = node?.firstElementChild || document.body;
    if (content) ro.observe(content);
    if (node) ro.observe(node);
    const mutations = new MutationObserver(measure);
    mutations.observe(node || document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      src.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      ro.disconnect();
      mutations.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!m.show) return null;

  const onDown = (ev: React.PointerEvent) => {
     ev.preventDefault();
     ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { y: ev.clientY, start: el()?.scrollTop || 0 };
  };
  const onMove = (ev: React.PointerEvent) => {
    const e = el();
    if (!drag.current || !e) return;
     const ratio = (e.scrollHeight - e.clientHeight) / Math.max(1, m.height - m.size);
    e.scrollTop = drag.current.start + (ev.clientY - drag.current.y) * ratio;
  };
  const onUp = () => { drag.current = null; };

  return createPortal(
    <div className="records-rail" aria-hidden="true" style={{ top: m.offset, height: m.height, right: m.right }}>
      <div
        className="records-rail-thumb"
        style={{ height: m.size, transform: `translateY(${m.top}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
      />
    </div>, document.body
  );
};

export default ScrollRail;
