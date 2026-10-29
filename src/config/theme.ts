/**
 * Visual Theme & Ambient Styling Configuration (Borderless Glass Aesthetic)
 */

export interface ThemeConfig {
  canvasBg: string;
  ambientBlobs: {
    topLeft: {
      color: string;
      size: string;
      blur: string;
    };
    bottomRight: {
      color: string;
      size: string;
      blur: string;
    };
    bottomLeft: {
      color: string;
      size: string;
      blur: string;
    };
  };
  glass: {
    rowBg: string;
    rowHover: string;
    backdropBlur: string;
  };
  badgeVariants: {
    blue: string;
    teal: string;
    green: string;
    neutral: string;
    amber: string;
    rose: string;
    red: string;
    purple: string;
  };
}

export const THEME: ThemeConfig = {
  canvasBg: '#0c0d12',
  ambientBlobs: {
    topLeft: {
      color: 'rgba(79, 70, 229, 0.14)', // Cool Indigo/Slate
      size: 'w-[550px] h-[550px]',
      blur: 'blur-[130px]',
    },
    bottomRight: {
      color: 'rgba(217, 119, 6, 0.14)', // Warm Amber/Brown
      size: 'w-[650px] h-[650px]',
      blur: 'blur-[150px]',
    },
    bottomLeft: {
      color: 'rgba(147, 51, 234, 0.10)', // Subtle Purple
      size: 'w-[500px] h-[500px]',
      blur: 'blur-[140px]',
    },
  },
  glass: {
    rowBg: 'bg-white/[0.04]',
    rowHover: 'hover:bg-white/[0.07]',
    backdropBlur: 'backdrop-blur-xl',
  },
  badgeVariants: {
    blue: 'bg-sky-500/15 text-sky-300',
    teal: 'bg-emerald-500/15 text-emerald-300',
    green: 'bg-green-500/15 text-green-400',
    neutral: 'bg-white/[0.06] text-zinc-300',
    amber: 'bg-amber-500/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-300',
    red: 'bg-red-500/20 text-red-300 animate-pulse',
    purple: 'bg-fuchsia-500/15 text-fuchsia-300',
  },
};
