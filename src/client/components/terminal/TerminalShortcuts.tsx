import {
  Keyboard,
  X,
  StopCircle,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';

interface TerminalShortcutsProps {
  onSendInput: (data: string) => void;
}

interface Shortcut {
  label: string;
  sequence: string;
  icon?: React.ReactNode;
  description: string;
}

const SHORTCUTS: { [category: string]: Shortcut[] } = {
  'Control Signals': [
    { label: 'Ctrl+C', sequence: '\x03', icon: <StopCircle className="w-3 h-3" />, description: 'Interrupt' },
    { label: 'Ctrl+D', sequence: '\x04', description: 'EOF' },
    { label: 'Ctrl+Z', sequence: '\x1A', description: 'Suspend' },
  ],
  'Screen': [
    { label: 'Ctrl+L', sequence: '\x0C', description: 'Clear' },
    { label: 'Ctrl+R', sequence: '\x12', icon: <RotateCcw className="w-3 h-3" />, description: 'Search history' },
  ],
  'Editing': [
    { label: 'Ctrl+A', sequence: '\x01', description: 'Line start' },
    { label: 'Ctrl+E', sequence: '\x05', description: 'Line end' },
    { label: 'Ctrl+K', sequence: '\x0B', description: 'Kill line' },
    { label: 'Ctrl+U', sequence: '\x15', description: 'Kill backward' },
    { label: 'Ctrl+W', sequence: '\x17', description: 'Kill word' },
  ],
  'Navigation': [
    { label: '↑', sequence: '\x1B[A', icon: <ArrowUp className="w-3 h-3" />, description: 'Up' },
    { label: '↓', sequence: '\x1B[B', icon: <ArrowDown className="w-3 h-3" />, description: 'Down' },
    { label: '←', sequence: '\x1B[D', icon: <ArrowLeft className="w-3 h-3" />, description: 'Left' },
    { label: '→', sequence: '\x1B[C', icon: <ArrowRight className="w-3 h-3" />, description: 'Right' },
  ],
  'Other': [
    { label: 'Tab', sequence: '\x09', description: 'Autocomplete' },
    { label: 'Esc', sequence: '\x1B', description: 'Escape' },
  ],
};

export function TerminalShortcuts({ onSendInput }: TerminalShortcutsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleShortcut = (sequence: string) => {
    onSendInput(sequence);
    // Keep panel open so users can send multiple commands
  };

  return (
    <div className="absolute bottom-2 right-2 z-20">
      {/* Shortcuts Panel */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-80 max-h-[70vh] overflow-y-auto bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl mb-2">
          <div className="sticky top-0 bg-gray-900/95 border-b border-gray-700 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-white">Shortcuts</h3>
            </div>
            <Button
              onClick={() => setIsOpen(false)}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>

          <div className="p-3 space-y-4">
            {Object.entries(SHORTCUTS).map(([category, shortcuts]) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-gray-400 mb-2">{category}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {shortcuts.map((shortcut) => (
                    <Button
                      key={shortcut.label}
                      onClick={() => handleShortcut(shortcut.sequence)}
                      variant="outline"
                      size="sm"
                      className="h-auto flex-col items-start p-2 text-left hover:bg-blue-500/10 hover:border-blue-500"
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        {shortcut.icon}
                        <span className="text-xs font-semibold text-white">
                          {shortcut.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-0.5">
                        {shortcut.description}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="sm"
        variant={isOpen ? 'default' : 'secondary'}
        className="h-10 w-10 p-0 rounded-full shadow-lg"
        title="Show keyboard shortcuts"
      >
        <Keyboard className="w-4 h-4" />
      </Button>
    </div>
  );
}
