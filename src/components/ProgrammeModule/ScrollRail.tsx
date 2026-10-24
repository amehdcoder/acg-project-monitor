import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Always-visible, draggable vertical scroll indicator. Android/iOS browsers
 * hide native scrollbars, so this draws its own colourful thumb.
 * Pass a ref to the scroll container, or omit it to follow the page.
 */
const ScrollRail = ({ target }: { target?: RefObject<HTMLElement> }) => {
  const [m, setM] = useState({ top: 0, size: 0, show: false });
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
        const view = node ? e.clientHeight : window.innerHeight;
        const total = e.scrollHeight;
        if (total <= view + 4) return setM((p) => (p.show ? { ...p, show: false } : p));
        const size = Math.max(44, (view / total) * view);
        const top = (e.scrollTop / (total - view)) * (view - size);
        setM({ top, size, show: true });
      });
    };
    measure();
    src.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    const content = node?.firstElementChild || document.body;
    if (content) ro.observe(content);
    return () => {
      cancelAnimationFrame(raf);
      src.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!m.show) return null;

  const onDown = (ev: React.PointerEvent) => {
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    drag.current = { y: ev.clientY, start: el()?.scrollTop || 0 };
  };
  const onMove = (ev: React.PointerEvent) => {
    const e = el();
    if (!drag.current || !e) return;
    const view = target?.current ? e.clientHeight : window.innerHeight;
    const ratio = (e.scrollHeight - view) / Math.max(1, view - m.size);
    e.scrollTop = drag.current.start + (ev.clientY - drag.current.y) * ratio;
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="records-rail" aria-hidden="true">
      <div
        className="records-rail-thumb"
        style={{ height: m.size, transform: `translateY(${m.top}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
};

export default ScrollRail;
