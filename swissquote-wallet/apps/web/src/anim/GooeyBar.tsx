// "Gooey" selection bar: the chosen item detaches from the group, linked to its neighbours by a neck
// that thins and then breaks, like a drop. Adapted from "Gooey Nav" (Rare UI, MIT licence): same
// spring and same neck path, without Tailwind or Next. Colours: --gooey-bar and --gooey-active.
import { useEffect, useId, type ReactNode } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';

// Damped spring: nothing overshoots.
const SPRING = { type: 'spring', stiffness: 200, damping: 28, mass: 1 } as const;
// The neck is gone once the gap reaches this fraction of its width.
const NECK_BREAK = 0.22;
const NECK_H = 100;
const SEPARATION = 10;
const RADIUS = 18;

/** Two concave curves pinching toward the middle, drawn in the gap between two items. */
function neckPath(gap: number, span: number) {
  if (!Number.isFinite(gap) || gap <= 0) return '';
  const waist = NECK_H * (1 - gap / (span * NECK_BREAK));
  if (waist <= 0) return '';
  const start = span - gap;
  const mid = start + gap / 2;
  return `M${start} 0 Q${mid} ${NECK_H - waist} ${span} 0 L${span} ${NECK_H} Q${mid} ${waist} ${start} ${NECK_H} Z`;
}

function Segment({
  gap,
  leftActive,
  rightActive,
  hasSeam,
  radii,
  reduced,
  active,
  children,
}: {
  gap: number;
  leftActive: boolean;
  rightActive: boolean;
  hasSeam: boolean;
  radii: Record<string, number>;
  reduced: boolean;
  active: boolean;
  children: ReactNode;
}) {
  const marginLeft = useSpring(gap, SPRING);
  const gradient = `gooey-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (reduced) marginLeft.jump(gap);
    else marginLeft.set(gap);
  }, [gap, marginLeft, reduced]);

  // The neck fills exactly the gap opening on the item's left.
  const d = useTransform(marginLeft, (g) => neckPath(g, SEPARATION));

  return (
    <motion.li
      className={active ? 'gooey-seg on' : 'gooey-seg'}
      style={{ marginLeft }}
      initial={false}
      animate={radii}
      transition={reduced ? { duration: 0 } : SPRING}
    >
      {hasSeam && (
        <svg
          aria-hidden
          className="gooey-neck"
          width={SEPARATION}
          viewBox={`0 0 ${SEPARATION} ${NECK_H}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="1">
              <stop offset="0" stopColor={leftActive ? 'var(--gooey-active)' : 'var(--gooey-bar)'} />
              <stop offset="1" stopColor={rightActive ? 'var(--gooey-active)' : 'var(--gooey-bar)'} />
            </linearGradient>
          </defs>
          <motion.path d={d} fill={`url(#${gradient})`} />
        </svg>
      )}
      {children}
    </motion.li>
  );
}

export function GooeyBar({ active, items }: { active: number; items: ReactNode[] }) {
  const reduced = useReducedMotion() ?? false;
  // A seam is open at both ends and on each side of the chosen item.
  const open = (seam: number) => seam === 0 || seam === items.length || seam - 1 === active || seam === active;

  return (
    <ul className="gooey">
      {items.map((item, i) => (
        <Segment
          key={i}
          // A closed seam overlaps by one pixel: no hairline shows through.
          gap={i === 0 ? 0 : open(i) ? SEPARATION : -1}
          hasSeam={i > 0}
          leftActive={i - 1 === active}
          rightActive={i === active}
          active={i === active}
          reduced={reduced}
          radii={{
            borderTopLeftRadius: open(i) ? RADIUS : 0,
            borderBottomLeftRadius: open(i) ? RADIUS : 0,
            borderTopRightRadius: open(i + 1) ? RADIUS : 0,
            borderBottomRightRadius: open(i + 1) ? RADIUS : 0,
          }}
        >
          {item}
        </Segment>
      ))}
    </ul>
  );
}
