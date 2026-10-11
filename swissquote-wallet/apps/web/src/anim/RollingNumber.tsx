// Nombre qui défile vers sa nouvelle valeur, chiffre par chiffre, comme un compteur kilométrique.
// Adapté d'« Animated Counter » (Rare UI, licence MIT) : même roue de chiffres et même masque,
// sans Tailwind. Prend un texte déjà formaté (« 0.0005 », « 1,250.5 ») : chaque colonne est repérée
// par sa distance à la virgule, pour que les unités restent alignées quand le nombre de décimales
// change (0.0005 → 0.00125).
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// Le 0 final rend le passage de 9 à 0 identique à une face : la roue ne saute pas.
const WHEEL = [...FACES, 0];
const LINE = 1.2;
// Fondu progressif en haut et en bas de la fenêtre : un chiffre au repos reste net.
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
      // Part d'où la roue se trouve : une valeur qui change vite n'accumule pas de tours en retard.
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
      {/* Largeur du chiffre le plus large, pour les polices sans chiffres tabulaires. */}
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

  // Sens de rotation : vers le haut quand la valeur monte, vers le bas quand elle descend.
  const [previous, setPrevious] = useState(amount);
  const [dir, setDir] = useState(1);
  if (previous !== amount) {
    setDir(amount >= previous ? 1 : -1);
    setPrevious(amount);
  }

  // Faces au premier affichage : rien ne défile à l'ouverture, une colonne qui apparaît part de 0.
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
