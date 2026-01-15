import { Minus, Plus } from 'lucide-react';
import { useTerminalSettings } from '../../hooks/useTerminalSettings';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { fontSize, increaseFontSize, decreaseFontSize, minFontSize, maxFontSize } = useTerminalSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminal Settings</DialogTitle>
          <DialogDescription>
            Customize your terminal appearance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Font Size Control */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-3 block">
              Font Size
            </label>
            <div className="flex items-center gap-4">
              <Button
                onClick={decreaseFontSize}
                disabled={fontSize <= minFontSize}
                variant="outline"
                size="lg"
                className="h-12 w-12 p-0"
              >
                <Minus className="w-5 h-5" />
              </Button>

              <div className="flex-1 text-center">
                <div className="text-3xl font-bold text-white mb-1">
                  {fontSize}
                </div>
                <div className="text-xs text-gray-500">
                  pixels
                </div>
              </div>

              <Button
                onClick={increaseFontSize}
                disabled={fontSize >= maxFontSize}
                variant="outline"
                size="lg"
                className="h-12 w-12 p-0"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            {/* Preview */}
            <div className="mt-4 p-4 bg-gray-950 rounded border border-gray-800">
              <div
                className="font-mono text-gray-300"
                style={{ fontSize: `${fontSize}px` }}
              >
                $ echo "Preview text"
              </div>
            </div>

            <div className="text-xs text-gray-500 mt-2 text-center">
              Range: {minFontSize}px - {maxFontSize}px
            </div>
          </div>

          {/* Apply Button */}
          <div className="flex justify-end pt-4 border-t border-gray-800">
            <Button
              onClick={() => {
                onOpenChange(false);
                window.location.reload();
              }}
              size="default"
            >
              Apply Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
