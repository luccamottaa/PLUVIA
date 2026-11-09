import type { Variants } from 'framer-motion';

/** Entrada em cascata: só opacity/transform, uma vez por cidade. Com movimento reduzido o pai não anima. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 28 } },
};
