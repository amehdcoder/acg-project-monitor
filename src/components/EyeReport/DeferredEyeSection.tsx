import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep expensive maps/tracker work out of first-screen loading. */
export default function DeferredEyeSection({ children, label }: { children: ReactNode; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className={visible ? "" : "min-h-80"}>{visible ? children : <p className="py-6 text-sm text-muted-foreground">{label}</p>}</div>;
}