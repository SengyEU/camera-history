import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface FrozenLayer {
  key: string;
  node: ReactNode;
}

interface ContentTransitionProps {
  transitionKey: string;
  children: ReactNode;
  /** Force animations on/off; defaults to on everywhere except test runs. */
  animate?: boolean;
}

const SETTLE_MS = 820;

const isTestRun = import.meta.env?.MODE === "test";

/** Animations are on in real runs, off in test runs (keeps tests deterministic). */
export const animationsEnabled = !isTestRun;

/**
 * Simple content hand-off: the new content renders beneath a frozen snapshot
 * of the previous content, which quietly fades out. No movement, no blink and
 * no height jump. The first content mount and reduced-motion users swap
 * without animating; test runs default to instant swaps.
 */
export function ContentTransition({
  transitionKey,
  children,
  animate = animationsEnabled,
}: ContentTransitionProps) {
  const [leaving, setLeaving] = useState<FrozenLayer | null>(null);
  const previous = useRef<FrozenLayer>({ key: transitionKey, node: children });
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const reducedMotion = useRef(
    typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const old = previous.current;
    if (old.key === transitionKey) return;
    if (timer.current !== null) clearTimeout(timer.current);
    if (!animateRef.current || reducedMotion.current) {
      setLeaving(null);
      return;
    }
    setLeaving(old);
    timer.current = setTimeout(() => {
      timer.current = null;
      setLeaving(null);
    }, SETTLE_MS);
  }, [transitionKey]);

  useEffect(() => {
    previous.current = { key: transitionKey, node: children };
  });

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="content-transition">
      {leaving !== null && (
        <div key={leaving.key} aria-hidden="true" className="content-layer content-exit">
          {leaving.node}
        </div>
      )}
      <div key={transitionKey} className={`content-layer${leaving !== null ? " content-enter" : ""}`}>
        {children}
      </div>
    </div>
  );
}
