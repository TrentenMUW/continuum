import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useLayoutEffect, useRef } from "react";
import { viewportStore } from "../../state/viewportStore";
import { xOf } from "../../time/viewport";
import styles from "./Timeline.module.css";

/**
 * The Now marker (§5.3, §5.11): a full-height line with a live local date and time.
 * Positioned imperatively every frame from the clock; React renders it once.
 */
export function NowMarker({ zone }: { zone: string }) {
  const lineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let lastSecond = NaN;
    const apply = () => {
      const line = lineRef.current;
      const label = labelRef.current;
      if (!line || !label) return;
      const now = viewportStore.now();
      const x = xOf(viewportStore.getViewport(), now);
      const visible = viewportStore.isInitialized() && x >= 0 && x <= viewportStore.getWidth();
      line.style.display = visible ? "" : "none";
      if (!visible) return;
      line.style.transform = `translateX(${x}px)`;

      const second = Math.floor(now / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        label.textContent = format(new TZDate(now, zone), "EEE d MMM yyyy, HH:mm:ss");
      }
    };
    apply();
    return viewportStore.subscribe(apply);
  }, [zone]);

  return (
    <div className={styles.nowLayer} aria-hidden="true">
      <div ref={lineRef} className={styles.nowLine}>
        <div ref={labelRef} className={styles.nowLabel} />
      </div>
    </div>
  );
}
