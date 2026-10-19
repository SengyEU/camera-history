import { useEffect, useRef, useState, type ReactNode } from "react";

export type TransitionDirection = "next" | "prev";

interface FrozenLayer {
  key: string;
  node: ReactNode;
  direction: TransitionDirection;
}

interface ContentTransitionProps {
  transitionKey: string;
  direction: TransitionDirection;
  children: ReactNode;
  /** Force animations on/off; defaults to on everywhere except test runs. */
  animate?: boolean;
}

const SETTLE_MS = 400;

const isTestRun = import.meta.env?.MODE === "test";

/**
 * Sliding content hand-off: the current content renders live while a frozen
 * snapshot of the previous content slides out the opposite way. Both layers
 * share one grid cell and stay fully opaque, so the widget never blinks and
 * its height never jumps. Honors prefers-reduced-motion and test runs by
 * swapping instantly.
 */
export function ContentTransition({
  transitionKey,
  direction,
  children,
  animate = !isTestRun,
}: ContentTransitionProps) {
  const [leaving, setLeaving] = useState<FrozenLayer | null>(null);
  const [enterDirection, setEnterDirection] = useState(direction);
  const previous = useRef<FrozenLayer>({ key: transitionKey, node: children, direction });
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const reducedMotion = useRef(
    typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const old = previous.current;
    if (old.key === transitionKey) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setEnterDirection(directionRef.current);
    if (!animateRef.current || reducedMotion.current) {
      setLeaving(null);
      return;
    }
    setLeaving({ ...old, direction: directionRef.current });
    timer.current = setTimeout(() => {
      timer.current = null;
      setLeaving(null);
    }, SETTLE_MS);
  }, [transitionKey]);

  useEffect(() => {
    previous.current = { key: transitionKey, node: children, direction };
  });

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="content-transition">
      {leaving !== null && (
        <div
          key={leaving.key}
          aria-hidden="true"
          className={`content-layer content-layer-leaving content-exit-${leaving.direction}`}
        >
          {leaving.node}
        </div>
      )}
      <div key={transitionKey} className={`content-layer content-enter-${enterDirection}`}>
        {children}
      </div>
    </div>
  );
}
