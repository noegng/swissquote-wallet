// Coche d'une étape : anneau en pointillés, puis disque qui se remplit en rebondissant et coche qui se
// dessine ; l'étape en cours a un anneau qui tourne. Adapté de « Task List » (Rare UI, licence MIT) :
// même anneau, même rebond et même tracé, sans le texte barré (une étape réussie n'est pas annulée).
import { motion, useReducedMotion, type Transition } from 'motion/react';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const FILL: Transition = { duration: 0.24, ease: EASE_OUT };
const POP: Transition = { duration: 0.34, ease: EASE_OUT, times: [0, 0.4, 1] };
const TICK: Transition = { duration: 0.22, ease: EASE_OUT, delay: 0.06 };
const SPIN: Transition = { duration: 1.2, ease: 'linear', repeat: Infinity };
const INSTANT: Transition = { duration: 0 };

// Les tirets divisent la circonférence : l'anneau se ferme sans raccord.
const RING_R = 11;
const RING_DASH = `1 ${(2 * Math.PI * RING_R) / 13 - 1}`;

export function StepCheck({ state }: { state: 'working' | 'done' }) {
  const reduced = useReducedMotion() ?? false;
  const t = (x: Transition) => (reduced ? INSTANT : x);
  const done = state === 'done';

  return (
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden
      className="step-check"
      // Au montage d'une étape terminée : anneau visible, puis remplissage et coche.
      initial={{ scale: 1 }}
      animate={{ scale: done ? [1, 1.12, 1] : 1, rotate: done || reduced ? 0 : 360 }}
      transition={done ? t(POP) : reduced ? INSTANT : SPIN}
    >
      <motion.circle
        cx="12"
        cy="12"
        r={RING_R}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={RING_DASH}
        initial={{ opacity: 1 }}
        animate={{ opacity: done ? 0 : 1 }}
        transition={t(FILL)}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="12"
        className="step-check-fill"
        style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
        initial={{ scale: 0 }}
        animate={{ scale: done ? 1 : 0 }}
        transition={t(FILL)}
      />
      <motion.path
        d="M7.4 12.4 10.6 15.5 16.6 8.9"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
        transition={t(TICK)}
      />
    </motion.svg>
  );
}
