// A number that rolls to its new value digit by digit, like an odometer.
// Adapted from "Animated Counter" (Rare UI, MIT licence): same digit wheel and same mask,
// without Tailwind. Takes an already formatted text ("0.0005", "1,250.5"): each column is keyed
// by its distance from the decimal point, so that units stay aligned when the number of decimals
// changes (0.0005 → 0.00125).
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// The trailing 0 makes the 9 → 0 wrap land on an identical face: the wheel does not jump.
const WHEEL = [...FACES, 0];
const LINE = 1.2;
// Gradual fade at the top and bottom of the window: a resting digit stays sharp.
const FADE = `linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)`;
const SPRING = { type: 'spring', visualDuration: 0.7, bounce: 0.18 } as const;
const LEAVE = { duration: 0.18 } as const;
const INSTANT = { duration: 0 } as const;

const mod = (n: number, m: number) => ((n % m) + m) % m;

type Cell = { kind: 'digit'; key: string; digit: number } | { kind: 'mark'; key: string; char: string };

function toCells(text: string): Cell[] {
  const dot = text.indexOf('.') === -1 ? text.length : text.indexOf('.');
  return [...text].map((char, i) =>
    char >= '0' && char <= '9'
      ? { kind: 'digit', key: `d${i - dot}`, digit: Number(char) }
      : { kind: 'mark', key: `m${i - dot}`, char },
  );
}

function useWheel(from: number, digit: number, dir: number, reduced: boolean) {
  const pos = useMotionValue(from);
  const goal = useRef(from);
  const heading = useRef(dir);
  heading.current = dir;

  useEffect(() => {
    if (reduced) {
      goal.current = digit;
      pos.set(digit);
      return;
    }
    if (mod(goal.current, 10) !== digit) {
      // Start from where the wheel is: a fast-changing value does not queue up a backlog of turns.
      const at = pos.get();
      goal.current = heading.current < 0 ? at - mod(at - digit, 10) : at + mod(digit - at, 10);
    }
    const roll = animate(pos, goal.current, SPRING);
    return () => roll.stop();
  }, [digit, reduced, pos]);

  return useTransform(pos, (p) => `${(-mod(p, 10) * 100) / WHEEL.length}%`);
}

const Digit = memo(function Digit({
  digit,
  from,
  dir,
  reduced,
}: {
  digit: number;
  from: number;
  dir: number;
  reduced: boolean;
}) {
  const y = useWheel(from, digit, dir, reduced);
  return (
    <motion.span
      layout={!reduced}
      className="roll-digit"
      style={{ height: `${LINE}em`, maskImage: FADE, WebkitMaskImage: FADE }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: reduced ? INSTANT : LEAVE }}
      transition={reduced ? INSTANT : SPRING}
    >
      {/* Width of the widest digit, for fonts without tabular figures. */}
      <span className="roll-sizer">0</span>
      <motion.span className="roll-stack" style={{ y }}>
        {WHEEL.map((face, i) => (
          <span key={i} style={{ height: `${LINE}em` }}>
            {face}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
});

export function RollingNumber({ value, suffix }: { value: string; suffix?: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const cells = toCells(value);
  const amount = Number(value.replace(/[^\d.]/g, '')) || 0;

  // Direction: up when the value rises, down when it falls.
  const [previous, setPrevious] = useState(amount);
  const [dir, setDir] = useState(1);
  if (previous !== amount) {
    setDir(amount >= previous ? 1 : -1);
    setPrevious(amount);
  }

  // Faces at first render: nothing rolls on mount, and a column that appears starts from 0.
  const [seed] = useState(() =>
    Object.fromEntries(cells.filter((c) => c.kind === 'digit').map((c) => [c.key, (c as { digit: number }).digit])),
  );

  return (
    <span className="roll">
      <span className="sr-only">{value}</span>
      <span aria-hidden className="roll-cells">
        <AnimatePresence mode="popLayout" initial={false}>
          {cells.map((cell) =>
            cell.kind === 'digit' ? (
              <Digit key={cell.key} digit={cell.digit} from={seed[cell.key] ?? 0} dir={dir} reduced={reduced} />
            ) : (
              <motion.span
                key={cell.key}
                layout={!reduced}
                className="roll-mark"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: reduced ? INSTANT : LEAVE }}
                transition={reduced ? INSTANT : SPRING}
              >
                {cell.char}
              </motion.span>
            ),
          )}
        </AnimatePresence>
      </span>
      {suffix != null && <span className="roll-suffix">{suffix}</span>}
    </span>
  );
}
