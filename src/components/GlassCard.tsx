import { ReactNode } from 'react';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className, hover = true }: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -4, scale: 1.01 } : undefined}
      className={cn(
        'liquid-glass rounded-3xl p-6 transition-all duration-300',
        className
      )}
    >
      {children}
    </motion.div>
  );
}
