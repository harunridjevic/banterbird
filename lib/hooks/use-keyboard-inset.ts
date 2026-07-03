"use client";

import { useEffect, useState } from "react";

/** Pixels the virtual keyboard overlaps the layout viewport (0 when closed). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(overlap)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
