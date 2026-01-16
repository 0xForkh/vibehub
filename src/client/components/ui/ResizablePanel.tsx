import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Button } from './button';

interface ResizablePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  statusIndicator?: ReactNode;
  children: ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  storageKey?: string;
}

export function ResizablePanel({
  isOpen,
  onClose,
  title,
  icon,
  statusIndicator,
  children,
  defaultHeight = 250,
  minHeight = 100,
  maxHeight = 600,
  storageKey,
}: ResizablePanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [height, setHeight] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`panel-height-${storageKey}`);
      if (saved) return Math.max(minHeight, Math.min(maxHeight, parseInt(saved, 10)));
    }
    return defaultHeight;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Save height to localStorage
  useEffect(() => {
    if (storageKey && height !== defaultHeight) {
      localStorage.setItem(`panel-height-${storageKey}`, height.toString());
    }
  }, [height, storageKey, defaultHeight]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Dragging up increases height (startY > currentY means dragging up)
      const delta = startY.current - e.clientY;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current + delta));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minHeight, maxHeight]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col border-t border-gray-200 bg-gray-900 dark:border-gray-700"
      style={{ height: isMinimized ? 'auto' : height }}
    >
      {/* Resize handle */}
      {!isMinimized && (
        <div
          className="h-1 cursor-ns-resize bg-gray-700 hover:bg-blue-500 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-1.5 flex-shrink-0">
        <button
          onClick={() => setIsMinimized(prev => !prev)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200"
        >
          {icon}
          <span className="font-medium">{title}</span>
          {statusIndicator}
          {isMinimized ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
          title="Close"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          {children}
        </div>
      )}
    </div>
  );
}
