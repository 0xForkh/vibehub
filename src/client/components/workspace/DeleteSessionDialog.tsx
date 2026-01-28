import { useState } from 'react';
import { GitBranch, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import type { Session } from '../../hooks/useSessions';

interface DeleteSessionDialogProps {
  session: Session | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (sessionId: string, cleanupWorktree: boolean, deleteBranch: boolean) => void;
}

export function DeleteSessionDialog({
  session,
  open,
  onOpenChange,
  onConfirm,
}: DeleteSessionDialogProps) {
  const [cleanupWorktree, setCleanupWorktree] = useState(true);
  const [deleteBranch, setDeleteBranch] = useState(false);

  if (!session) return null;

  const hasWorktree = !!session.claudeMetadata?.worktreePath;

  const handleConfirm = () => {
    onConfirm(
      session.id,
      hasWorktree && cleanupWorktree,
      hasWorktree && cleanupWorktree && deleteBranch
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-400" />
            Delete Session
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{session.name}"?
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {hasWorktree && (
            <div className="rounded-md border border-yellow-600/30 bg-yellow-600/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-200">
                    This session has a git worktree
                  </p>
                  <p className="mt-1 text-yellow-300/80 text-xs">
                    {session.claudeMetadata?.worktreePath}
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanupWorktree}
                  onChange={(e) => {
                    setCleanupWorktree(e.target.checked);
                    // Reset delete branch if unchecking cleanup worktree
                    if (!e.target.checked) {
                      setDeleteBranch(false);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                />
                <span className="flex items-center gap-1.5 text-sm text-gray-300">
                  <GitBranch className="h-3.5 w-3.5" />
                  Also remove the git worktree
                </span>
              </label>

              {cleanupWorktree && (
                <label className="flex items-center gap-2 mt-2 ml-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteBranch}
                    onChange={(e) => setDeleteBranch(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                  />
                  <span className="text-sm text-gray-400">
                    Also delete the branch
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
