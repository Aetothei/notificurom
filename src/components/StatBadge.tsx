import React from 'react';
import { Icon } from '@iconify/react';
import { THEME } from '@/config/theme';

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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-md transition-all duration-150 select-none ${variantClass} ${
        isClickable
          ? 'cursor-pointer hover:bg-amber-500/20 hover:text-amber-300 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)] active:scale-95'
          : ''
      } ${className}`}
    >
      {icon && <Icon icon={icon} className="w-3.5 h-3.5 shrink-0" />}
      {label && <span className="text-zinc-400 font-normal">{label}</span>}
      {value !== undefined && (
        <span className="font-semibold tracking-tight">
          {value}
          {unit && <span className="ml-0.5 text-[10px] opacity-80">{unit}</span>}
        </span>
      )}
    </div>
  );
};
