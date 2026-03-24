import { usePlan } from '../../hooks/usePlan';
import type { Plan } from '../../types';
import type { ReactNode } from 'react';

interface GatedContentProps {
  requires: Plan;
  children: ReactNode;
  /** How blurred — 6 for cards, 4 for rows */
  blurAmount?: number;
  opacity?: number;
}

export function GatedContent({
  requires,
  children,
  blurAmount = 6,
  opacity = 0.45,
}: GatedContentProps) {
  const { has } = usePlan();

  if (has(requires)) return <>{children}</>;

  return (
    <div className="overflow-hidden rounded-lg">
      <div
        className="select-none pointer-events-none"
        style={{
          filter: `blur(${blurAmount}px)`,
          opacity: opacity,
        }}
        aria-hidden
      >
        {children}
      </div>
    </div>
  );
}
