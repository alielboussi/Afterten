import { useEffect } from "react";

/** Stop mouse wheel from incrementing/decrementing focused `<input type="number">`. */
export function useDisableNumberInputWheel() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.type !== "number") return;
      if (document.activeElement !== el) return;
      e.preventDefault();
    }

    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
}
