// Bell that rings when new alerts arrive, with a count that bounces in
// and whose digits roll. Adapted from "Notification Bell" (Rare UI, MIT licence): same pendulum
// spring and same digit column, applied to the Activity tab icon.
import { useEffect, useRef, type ReactNode } from 'react';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
} from 'motion/react';

// Low damping: the bell keeps swinging for a while.
const SWING = { type: 'spring', stiffness: 220, damping: 10, mass: 1, restDelta: 0.01 } as const;
const COLUMN = { stiffness: 400, damping: 30, mass: 0.9 };
const ENTER = { type: 'spring', stiffness: 600, damping: 20 } as const;
const FADE = { duration: 0.15 } as const;
// Degrees per second.
const IMPULSE = 500;
const MAX_VELOCITY = 900;
const BURST = 5;
const WINDOW = 3;
const LAG = 2;
const ROLL_FADE = 34;
const ROLL_VELOCITY = 9;

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
const digitOf = (v: number) => ((v % 10) + 10) % 10;

/** Pendulum: each rise of the count gives an impulse, stronger when several alerts arrive. */
function useBellRing(total: number, reduced: boolean) {
  const swing = useMotionValue(0);
  const previous = useRef(total);
  const ringing = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const delta = total - previous.current;
    previous.current = total;
    if (delta <= 0 || reduced) return;
    const weight = 0.7 + (0.6 * Math.min(delta, BURST)) / BURST;
    const moving = swing.getVelocity();
    const along = moving > 1 ? 1 : -1;
    ringing.current = animate(swing, 0, { ...SWING, velocity: clamp(moving + along * IMPULSE * weight, MAX_VELOCITY) });
  }, [total, reduced, swing]);

  useEffect(() => () => ringing.current?.stop(), []);
  return swing;
}

/** A digit column that rolls in the direction the count moved. */
function DigitColumn({ value, reduced }: { value: number; reduced: boolean }) {
  const position = useSpring(value, COLUMN);
  const y = useTransform(position, (p) => `${-p * 100}%`);
  const velocity = useVelocity(position);
  const mask = useTransform(velocity, (v) => {
    const fade = Math.min(ROLL_FADE, (Math.abs(v) / ROLL_VELOCITY) * ROLL_FADE);
    return `linear-gradient(to bottom, transparent 0%, #000 ${fade}%, #000 ${100 - fade}%, transparent 100%)`;
  });

  useEffect(() => {
    const gap = value - position.get();
    if (Math.abs(gap) > LAG) position.jump(value - Math.sign(gap) * LAG);
    if (reduced) position.jump(value);
    else position.set(value);
  }, [value, reduced, position]);

  return (
    <motion.span
      className="bell-col"
      style={{ maskImage: reduced ? undefined : mask, WebkitMaskImage: reduced ? undefined : mask }}
    >
      <motion.span className="bell-col-stack" style={{ y }}>
        {Array.from({ length: WINDOW * 2 + 1 }, (_, i) => {
          const tile = value - WINDOW + i;
          return (
            <span key={tile} style={{ top: `${tile * 100}%` }}>
              {digitOf(tile)}
            </span>
          );
        })}
      </motion.span>
    </motion.span>
  );
}

export function RingingBell({ count, max = 9, children }: { count: number; max?: number; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const swing = useBellRing(total, reduced);
  const places = total > max ? 0 : String(total).length;

  return (
    <span className="bell">
      {/* The bell hangs from the top: it pivots around its ring, not its centre. */}
      <motion.span className="bell-icon" style={{ rotate: swing, transformOrigin: '50% 12%' }}>
        {children}
      </motion.span>
      <AnimatePresence initial={false}>
        {total > 0 && (
          <motion.span
            key="badge"
            layout={!reduced}
            aria-hidden
            className="bell-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={reduced ? FADE : ENTER}
          >
            {total > max
              ? `${max}+`
              : Array.from({ length: places }, (_, i) => {
                  const place = places - 1 - i;
                  return <DigitColumn key={place} value={Math.floor(total / 10 ** place)} reduced={reduced} />;
                })}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
