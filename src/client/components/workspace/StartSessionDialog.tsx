import { useState } from 'react';
import { GitBranch, Play } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import type { TaskAttachment } from './tasks/types';

interface StartSessionDialogProps {
  taskTitle: string | null;
  taskDescription?: string;
  taskId?: string;
  attachments?: TaskAttachment[];
  projectPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    name: string,
    workingDir: string,
    initialPrompt?: string,
    taskId?: string,
    attachments?: TaskAttachment[],
    worktree?: { branch: string }
  ) => void;
}

export function StartSessionDialog({
  taskTitle,
  taskDescription,
  taskId,
  attachments,
  projectPath,
  open,
  onOpenChange,
  onConfirm,
}: StartSessionDialogProps) {
  const [useWorktree, setUseWorktree] = useState(false);
  const [worktreeBranch, setWorktreeBranch] = useState('');

  if (!taskTitle) return null;

  const handleConfirm = () => {
    const worktree = useWorktree && worktreeBranch.trim()
      ? { branch: worktreeBranch.trim() }
      : undefined;
    onConfirm(taskTitle, projectPath, taskDescription, taskId, attachments, worktree);
    onOpenChange(false);
    // Reset state for next time
    setUseWorktree(false);
    setWorktreeBranch('');
  };

  const handleCancel = () => {
    onOpenChange(false);
    setUseWorktree(false);
    setWorktreeBranch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-400" />
            Start Session
          </DialogTitle>
          <DialogDescription>
            Start a new Claude session for "{taskTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Worktree option */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={(e) => setUseWorktree(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
              />
              <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                <GitBranch className="h-3.5 w-3.5" />
                Use git worktree
              </span>
            </label>
            <p className="mt-1.5 ml-6 text-xs text-gray-500 dark:text-gray-500">
              Creates an isolated copy of the repo on a new branch
            </p>

            {useWorktree && (
              <div className="mt-3 ml-6">
                <Input
                  value={worktreeBranch}
                  onChange={(e) => setWorktreeBranch(e.target.value)}
                  placeholder="Branch name (e.g., feature/auth)"
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && worktreeBranch.trim()) handleConfirm();
                    if (e.key === 'Escape') handleCancel();
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={useWorktree && !worktreeBranch.trim()}
            >
              Start Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
