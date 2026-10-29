import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-amber-500/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        amber:
          'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        outline:
          'bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 backdrop-blur-xl',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-white/[0.06] hover:text-zinc-100 text-zinc-400',
        destructive:
          'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
        link: 'text-amber-400 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 gap-1.5 px-3.5',
        xs: 'h-6 gap-1 rounded-full px-2.5 text-xs',
        sm: 'h-7 gap-1.5 rounded-full px-3 text-xs',
        lg: 'h-10 gap-2 rounded-full px-5 text-sm',
        icon: 'size-9 rounded-full',
        'icon-sm': 'size-7 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
