import { motion } from 'motion/react';

export default function ActionButton({ className = '', disabled, children, ...props }) {
  const raised = /(?:^|\s)(primary|surface-button|icon-button|landmark-chip)(?:\s|$)/.test(className);
  return <motion.button {...props} className={className} disabled={disabled}
    whileHover={raised && !disabled ? { boxShadow: '6px 6px 0px #202438' } : undefined}
    whileTap={raised && !disabled ? { boxShadow: '0px 0px 0px #202438' } : undefined}>
    {children}
  </motion.button>;
}
