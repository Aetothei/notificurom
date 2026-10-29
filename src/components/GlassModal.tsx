import React from 'react';
import { Icon } from '@iconify/react';
import { Dialog as DialogPrimitive } from 'radix-ui';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const GlassModal: React.FC<GlassModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = 'max-w-xl',
}) => {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />

        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={`fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full ${maxWidth} bg-[#14151e]/95 rounded-3xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.75)] backdrop-blur-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200 outline-none`}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/[0.05] px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                <Icon icon={icon} className="w-4 h-4" />
              </div>
              <DialogPrimitive.Title className="text-base font-semibold text-zinc-100 tracking-tight">
                {title}
              </DialogPrimitive.Title>
            </div>

            <DialogPrimitive.Close asChild>
              <button
                type="button"
                onClick={onClose}
                className="w-11 h-11 rounded-full bg-white/[0.05] hover:bg-white/10 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
              >
                <Icon icon="mdi:close" className="w-5 h-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-5 max-h-[75vh] overflow-y-auto pr-1">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
