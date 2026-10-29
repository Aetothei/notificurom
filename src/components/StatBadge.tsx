import React from 'react';
import { Icon } from '@iconify/react';
import { THEME } from '@/config/theme';
import { cn } from '@/lib/utils';

export type StatBadgeVariant =
  | 'blue'
  | 'teal'
  | 'green'
  | 'neutral'
  | 'amber'
  | 'rose'
  | 'red'
  | 'purple';

interface StatBadgeProps {
  label?: string;
  icon?: string;
  value?: string | number;
  unit?: string;
  variant?: StatBadgeVariant;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}

export const StatBadge: React.FC<StatBadgeProps> = ({
  label,
  icon,
  value,
  unit,
  variant = 'neutral',
  onClick,
  title,
  className = '',
}) => {
  const variantClass = THEME.badgeVariants[variant] || THEME.badgeVariants.neutral;
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full h-6 px-2.5 text-[11px] leading-none font-medium backdrop-blur-md transition-all duration-150 select-none whitespace-nowrap shrink-0',
        variantClass,
        isClickable &&
          'cursor-pointer hover:bg-amber-500/20 hover:text-amber-300 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)] active:scale-95',
        className
      )}
    >
      {icon && <Icon icon={icon} className="w-3.5 h-3.5 shrink-0" />}
      {label && <span className="text-zinc-400 font-normal leading-none">{label}</span>}
      {value !== undefined && (
        <span className="font-semibold tracking-tight leading-none">
          {value}
          {unit && <span className="ml-0.5 text-[10px] opacity-80">{unit}</span>}
        </span>
      )}
    </div>
  );
};
