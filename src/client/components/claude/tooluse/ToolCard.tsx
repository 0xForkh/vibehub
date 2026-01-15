import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type ColorScheme = 'blue' | 'green' | 'orange' | 'purple' | 'amber' | 'gray' | 'cyan';

const colorClasses: Record<ColorScheme, { border: string; bg: string; text: string }> = {
  blue: {
    border: 'border-blue-200 dark:border-blue-700',
    bg: 'bg-blue-50 dark:bg-blue-950',
    text: 'text-blue-700 dark:text-blue-300',
  },
  green: {
    border: 'border-green-200 dark:border-green-700',
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
  },
  orange: {
    border: 'border-orange-200 dark:border-orange-700',
    bg: 'bg-orange-50 dark:bg-orange-950',
    text: 'text-orange-700 dark:text-orange-300',
  },
  purple: {
    border: 'border-purple-200 dark:border-purple-700',
    bg: 'bg-purple-50 dark:bg-purple-950',
    text: 'text-purple-700 dark:text-purple-300',
  },
  amber: {
    border: 'border-amber-200 dark:border-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
  },
  cyan: {
    border: 'border-cyan-200 dark:border-cyan-700',
    bg: 'bg-cyan-50 dark:bg-cyan-950',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  gray: {
    border: 'border-gray-700',
    bg: 'bg-gray-900',
    text: 'text-gray-400',
  },
};

interface ToolCardProps {
  icon: LucideIcon;
  color: ColorScheme;
  title: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}

export function ToolCard({ icon: Icon, color, title, badge, onClick, children }: ToolCardProps) {
  const colors = colorClasses[color];

  return (
    <div className={`my-2 rounded-md border p-3 ${colors.border} ${colors.bg}`}>
      <div
        className={`flex items-start gap-2 text-sm font-medium ${colors.text} ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
      >
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 break-all">{title}</span>
        {badge && <span className="ml-auto flex-shrink-0 text-xs opacity-70">{badge}</span>}
      </div>
      {children}
    </div>
  );
}
