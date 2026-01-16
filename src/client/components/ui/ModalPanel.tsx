import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Button } from './button';

interface ModalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  statusIndicator?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

const widthClasses = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export function ModalPanel({
  isOpen,
  onClose,
  title,
  icon,
  statusIndicator,
  toolbar,
  children,
  width = '3xl',
}: ModalPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative flex max-h-[80vh] w-full flex-col rounded-lg border border-gray-700 bg-gray-900 shadow-2xl ${widthClasses[width]}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium text-gray-200">{title}</span>
            {statusIndicator}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 text-gray-400 hover:text-gray-200"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar */}
        {toolbar && (
          <div className="flex items-center gap-1 border-b border-gray-700 px-3 py-1.5 bg-gray-800 flex-shrink-0">
            {toolbar}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
