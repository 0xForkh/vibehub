import { useState, useEffect } from 'react';
import { GitBranch } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';

interface ForkSessionDialogProps {
  sessionName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
}

export function ForkSessionDialog({
  sessionName,
  open,
  onOpenChange,
  onConfirm,
}: ForkSessionDialogProps) {
  const [name, setName] = useState('');

  // Reset name when dialog opens with a new session
  useEffect(() => {
    if (open && sessionName) {
      setName(`${sessionName} (fork)`);
    }
  }, [open, sessionName]);

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim());
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) {
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-blue-400" />
            Fork Session
          </DialogTitle>
          <DialogDescription>
            Create a new session branched from the current conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="fork-name" className="block text-sm font-medium text-gray-300 mb-1.5">
              New session name
            </label>
            <Input
              id="fork-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter session name..."
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!name.trim()}
            >
              Fork
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
