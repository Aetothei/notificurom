import React from 'react';
import { Icon } from '@iconify/react';

interface SectionHeaderProps {
  title: string;
  icon: string;
  count?: number;
  rightSlot?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  count,
  rightSlot,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex items-center gap-2 shrink-0">
        <Icon icon={icon} className="w-4 h-4 text-amber-400/90" />
        <h2 className="text-xs font-bold tracking-widest text-zinc-300 uppercase select-none">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.06] text-zinc-300 font-mono font-semibold">
            {count}
          </span>
        )}
      </div>
      <div className="flex-1" />
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
};
