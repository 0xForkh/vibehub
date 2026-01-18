import { GitBranch, RefreshCw, FileText, FilePlus, FileMinus, FileQuestion, Clock, User, ChevronRight, ChevronDown, GitCommitHorizontal, GitMerge, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Button } from '../ui/button';
import { ModalPanel } from '../ui/ModalPanel';

interface GitPanelProps {
  workingDir: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onWorktreeMerged?: () => void; // Callback when worktree is merged and deleted
}

interface WorktreeInfo {
  isWorktree: boolean;
  mainRepoPath?: string;
  currentBranch?: string;
  defaultBranch?: string;
  hasUncommittedChanges?: boolean;
}

interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  staged: boolean;
}

interface GitStatus {
  branch: string;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  isClean: boolean;
}

interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  relativeDate: string;
}

const statusIcons: Record<GitFileChange['status'], typeof FileText> = {
  modified: FileText,
  added: FilePlus,
  deleted: FileMinus,
  renamed: FileText,
  copied: FileText,
  untracked: FileQuestion,
};

const statusColors: Record<GitFileChange['status'], string> = {
  modified: 'text-yellow-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  copied: 'text-blue-500',
  untracked: 'text-gray-400',
};

const statusLabels: Record<GitFileChange['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: '?',
};

export function GitPanel({ workingDir, isOpen, onClose, onWorktreeMerged }: GitPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);

  const [showBranchList, setShowBranchList] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    staged: true,
    unstaged: true,
    history: true,
  });

  // Diff view state
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Commit state
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitStatus, setCommitStatus] = useState<string>('');
  const [commitMessages, setCommitMessages] = useState<string[]>([]);
  const [commitResult, setCommitResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Worktree merge state
  const [worktreeInfo, setWorktreeInfo] = useState<WorktreeInfo | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<string>('');
  const [mergeResult, setMergeResult] = useState<{ success: boolean; error?: string; warning?: string; conflictFiles?: string[] } | null>(null);
  const [mergeOptions, setMergeOptions] = useState({ deleteWorktree: true, deleteBranch: true });

  const fetchGitData = useCallback(async () => {
    if (!workingDir) return;

    setIsLoading(true);
    setError(null);

    try {
      const encodedPath = encodeURIComponent(workingDir);

      const [statusRes, branchesRes, logRes] = await Promise.all([
        fetch(`/api/git/status?path=${encodedPath}`),
        fetch(`/api/git/branches?path=${encodedPath}`),
        fetch(`/api/git/log?path=${encodedPath}&limit=10`),
      ]);

      if (!statusRes.ok) {
        const data = await statusRes.json();
        throw new Error(data.error || 'Failed to fetch git status');
      }

      const statusData = await statusRes.json();
      const branchesData = await branchesRes.json();
      const logData = await logRes.json();

      setStatus(statusData);
      setBranches(branchesData.branches || []);
      setCommits(logData.commits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch git data');
    } finally {
      setIsLoading(false);
    }
  }, [workingDir]);

  const fetchWorktreeInfo = useCallback(async () => {
    if (!workingDir) return;

    try {
      const encodedPath = encodeURIComponent(workingDir);
      const res = await fetch(`/api/git/worktree-info?path=${encodedPath}`);
      if (res.ok) {
        const data = await res.json();
        setWorktreeInfo(data);
      }
    } catch (err) {
      // Non-critical, just don't show merge button
      setWorktreeInfo(null);
    }
  }, [workingDir]);

  useEffect(() => {
    if (isOpen && workingDir) {
      fetchGitData();
      fetchWorktreeInfo();
    }
  }, [isOpen, workingDir, fetchGitData, fetchWorktreeInfo]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const fetchDiff = useCallback(async (filePath: string, staged: boolean) => {
    if (!workingDir) return;

    setDiffLoading(true);
    setDiffError(null);
    setSelectedFile({ path: filePath, staged });

    try {
      const encodedPath = encodeURIComponent(workingDir);
      const encodedFile = encodeURIComponent(filePath);
      const res = await fetch(`/api/git/diff?path=${encodedPath}&file=${encodedFile}&staged=${staged}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch diff');
      }

      const data = await res.json();
      setDiffContent(data.diff || '');
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Failed to fetch diff');
    } finally {
      setDiffLoading(false);
    }
  }, [workingDir]);

  const handleCommit = useCallback(async () => {
    if (!workingDir || isCommitting) return;

    setIsCommitting(true);
    setCommitResult(null);
    setCommitStatus('Starting...');
    setCommitMessages([]);
    setError(null);

    try {
      const response = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workingDir }),
      });

      // Check if it's an SSE response or error JSON
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        setError(data.error || 'Failed to commit');
        setCommitResult({ success: false, error: data.error });
        setIsCommitting(false);
        return;
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'status') {
                setCommitStatus(data.status);
              } else if (currentEvent === 'tool') {
                setCommitStatus(data.description);
              } else if (currentEvent === 'message') {
                setCommitMessages(prev => [...prev, data.text]);
              } else if (currentEvent === 'done') {
                setCommitResult({ success: data.success, error: data.error });
                if (data.success) {
                  fetchGitData();
                }
              }
            } catch {
              // Ignore parse errors
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit');
      setCommitResult({ success: false, error: 'Connection error' });
    } finally {
      setIsCommitting(false);
    }
  }, [workingDir, isCommitting, fetchGitData]);

  const handleMergeWorktree = useCallback(async () => {
    if (!workingDir || isMerging || !worktreeInfo?.isWorktree) return;

    setIsMerging(true);
    setMergeResult(null);
    setMergeStatus('Starting merge...');
    setShowMergeConfirm(false);
    setError(null);

    try {
      const response = await fetch('/api/git/merge-worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worktreePath: workingDir,
          targetBranch: worktreeInfo.defaultBranch,
          deleteWorktree: mergeOptions.deleteWorktree,
          deleteBranch: mergeOptions.deleteBranch,
        }),
      });

      // Check if it's an SSE response or error JSON
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        setError(data.error || 'Failed to merge');
        setMergeResult({ success: false, error: data.error });
        setIsMerging(false);
        return;
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'status') {
                setMergeStatus(data.message);
              } else if (currentEvent === 'done') {
                setMergeResult({
                  success: data.success,
                  error: data.error,
                  warning: data.warning,
                  conflictFiles: data.conflictFiles,
                });
                if (data.success && mergeOptions.deleteWorktree && onWorktreeMerged) {
                  // Notify parent that worktree was merged and deleted
                  onWorktreeMerged();
                }
              }
            } catch {
              // Ignore parse errors
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge');
      setMergeResult({ success: false, error: 'Connection error' });
    } finally {
      setIsMerging(false);
    }
  }, [workingDir, isMerging, worktreeInfo, mergeOptions, onWorktreeMerged]);

  const changeCount = status ? status.staged.length + status.unstaged.length : 0;
  const canMerge = worktreeInfo?.isWorktree && !worktreeInfo?.hasUncommittedChanges;

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Git"
      icon={<GitBranch className="h-4 w-4 text-orange-500" />}
      statusIndicator={
        status && (
          <span className="text-xs text-gray-500">
            {status.branch} • {changeCount} changes
          </span>
        )
      }
      width="6xl"
      toolbar={
        <div className="flex items-center gap-1">
          {changeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCommit}
              disabled={isLoading || isCommitting || isMerging}
              className="h-6 gap-1 px-2 text-xs"
              title="Ask Claude to commit changes"
            >
              <GitCommitHorizontal className={`h-3 w-3 ${isCommitting ? 'animate-pulse' : ''}`} />
              {isCommitting ? 'Committing...' : 'Commit'}
            </Button>
          )}
          {worktreeInfo?.isWorktree && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMergeConfirm(true)}
                disabled={isLoading || isCommitting || isMerging || !canMerge}
                className="h-6 gap-1 px-2 text-xs"
                title={canMerge ? `Merge ${worktreeInfo.currentBranch} into ${worktreeInfo.defaultBranch}` : 'Commit changes before merging'}
              >
                <GitMerge className={`h-3 w-3 ${isMerging ? 'animate-pulse' : ''}`} />
                {isMerging ? 'Merging...' : 'Merge'}
              </Button>
              {showMergeConfirm && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMergeConfirm(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <div className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                      Merge Worktree
                    </div>
                    <div className="mb-3 text-xs text-gray-600 dark:text-gray-400">
                      Merge <span className="font-mono text-blue-600 dark:text-blue-400">{worktreeInfo.currentBranch}</span> into <span className="font-mono text-green-600 dark:text-green-400">{worktreeInfo.defaultBranch}</span>
                    </div>
                    <div className="mb-3 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={mergeOptions.deleteWorktree}
                          onChange={(e) => setMergeOptions(prev => ({ ...prev, deleteWorktree: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600"
                        />
                        Delete worktree after merge
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={mergeOptions.deleteBranch}
                          onChange={(e) => setMergeOptions(prev => ({ ...prev, deleteBranch: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600"
                        />
                        Delete branch after merge
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMergeConfirm(false)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleMergeWorktree}
                        className="h-7 bg-green-600 hover:bg-green-700 text-xs"
                      >
                        Merge
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { fetchGitData(); fetchWorktreeInfo(); }}
            disabled={isLoading || isCommitting || isMerging}
            className="h-6 w-6 p-0"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
    >
      {/* Content */}
      <div className="flex-1 flex min-h-0 bg-white dark:bg-gray-900" style={{ maxHeight: '70vh' }}>
        {/* Dedicated Merge View - Full Width */}
        {(isMerging || mergeResult) ? (
          <div className="flex-1 flex flex-col p-6">
            {/* Status header */}
            <div className={`rounded-lg p-4 mb-4 ${
              mergeResult
                ? mergeResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            }`}>
              <div className="flex items-center gap-3">
                {isMerging && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40">
                    <GitMerge className="h-4 w-4 animate-pulse text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                {mergeResult && (
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    mergeResult.success
                      ? 'bg-green-100 dark:bg-green-900/40'
                      : 'bg-red-100 dark:bg-red-900/40'
                  }`}>
                    <span className="text-lg">{mergeResult.success ? '✓' : '✗'}</span>
                  </div>
                )}
                <div>
                  <div className={`font-medium ${
                    mergeResult
                      ? mergeResult.success
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                      : 'text-blue-700 dark:text-blue-300'
                  }`}>
                    {mergeResult
                      ? mergeResult.success
                        ? 'Merge successful'
                        : mergeResult.error || 'Merge failed'
                      : 'Merging worktree...'}
                  </div>
                  {isMerging && mergeStatus && (
                    <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      {mergeStatus}
                    </div>
                  )}
                  {mergeResult?.warning && (
                    <div className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                      <AlertTriangle className="h-3 w-3" />
                      {mergeResult.warning}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Conflict files */}
            {mergeResult?.conflictFiles && mergeResult.conflictFiles.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 mb-4">
                <div className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                  Conflicting files:
                </div>
                <ul className="text-xs text-red-600 dark:text-red-400 font-mono space-y-1">
                  {mergeResult.conflictFiles.map((file, i) => (
                    <li key={i}>• {file}</li>
                  ))}
                </ul>
                <div className="mt-3 text-xs text-red-600 dark:text-red-400">
                  Please resolve conflicts manually before merging.
                </div>
              </div>
            )}

            {/* Back button (only when done) */}
            {mergeResult && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMergeResult(null);
                    setMergeStatus('');
                  }}
                >
                  ← Back to changes
                </Button>
              </div>
            )}
          </div>
        ) : (isCommitting || commitResult) ? (
          <div className="flex-1 flex flex-col p-6">
            {/* Status header */}
            <div className={`rounded-lg p-4 mb-4 ${
              commitResult
                ? commitResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            }`}>
              <div className="flex items-center gap-3">
                {isCommitting && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40">
                    <GitCommitHorizontal className="h-4 w-4 animate-pulse text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                {commitResult && (
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    commitResult.success
                      ? 'bg-green-100 dark:bg-green-900/40'
                      : 'bg-red-100 dark:bg-red-900/40'
                  }`}>
                    <span className="text-lg">{commitResult.success ? '✓' : '✗'}</span>
                  </div>
                )}
                <div>
                  <div className={`font-medium ${
                    commitResult
                      ? commitResult.success
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                      : 'text-blue-700 dark:text-blue-300'
                  }`}>
                    {commitResult
                      ? commitResult.success
                        ? 'Commit successful'
                        : commitResult.error || 'Commit failed'
                      : 'Committing changes...'}
                  </div>
                  {isCommitting && commitStatus && (
                    <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      {commitStatus}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages from Claude */}
            <div className="flex-1 min-h-0 overflow-auto">
              {commitMessages.length > 0 ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap space-y-3">
                    {commitMessages.map((msg, i) => (
                      <div key={i} className={i > 0 ? 'pt-3 border-t border-gray-200 dark:border-gray-700' : ''}>
                        {msg}
                      </div>
                    ))}
                  </div>
                </div>
              ) : isCommitting ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Claude is analyzing changes...</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Back button (only when done) */}
            {commitResult && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCommitResult(null);
                    setCommitMessages([]);
                    setCommitStatus('');
                  }}
                >
                  ← Back to changes
                </Button>
              </div>
            )}
          </div>
        ) : (
        /* Side by side layout for normal view */
        <>
        {/* Left Panel - File List */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-auto p-3">
          {!workingDir ? (
            <div className="text-center text-sm text-gray-500">No working directory</div>
          ) : error ? (
            <div className="text-center text-sm text-red-500">{error}</div>
          ) : isLoading && !status ? (
            <div className="text-center text-sm text-gray-500">Loading...</div>
          ) : (
            <div className="space-y-4">
              {/* Branch Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowBranchList(!showBranchList)}
                  className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {status?.branch || 'Loading...'}
                    </span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${showBranchList ? 'rotate-180' : ''}`} />
                </button>

                {showBranchList && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowBranchList(false)} />
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      {branches.map((branch) => (
                        <div
                          key={branch.name}
                          className={`flex items-center gap-2 px-3 py-2 text-sm ${
                            branch.isCurrent
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                          }`}
                        >
                          <GitBranch className={`h-3.5 w-3.5 ${branch.isRemote ? 'text-gray-400' : ''}`} />
                          <span className={branch.isRemote ? 'text-gray-500' : ''}>
                            {branch.name}
                          </span>
                          {branch.isCurrent && (
                            <span className="ml-auto text-xs text-blue-500">current</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Changes Section */}
              {status && (
                <div className="space-y-3">
                  {/* Staged Changes */}
                  {status.staged.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleSection('staged')}
                        className="flex w-full items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                      >
                        <ChevronRight className={`h-4 w-4 transition-transform ${expandedSections.staged ? 'rotate-90' : ''}`} />
                        <span>Staged ({status.staged.length})</span>
                      </button>
                      {expandedSections.staged && (
                        <div className="mt-1 space-y-0.5 pl-5">
                          {status.staged.map((file) => (
                            <FileChangeItem
                              key={file.path}
                              file={file}
                              onClick={() => fetchDiff(file.path, true)}
                              isSelected={selectedFile?.path === file.path && selectedFile?.staged === true}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Unstaged Changes */}
                  {status.unstaged.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleSection('unstaged')}
                        className="flex w-full items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                      >
                        <ChevronRight className={`h-4 w-4 transition-transform ${expandedSections.unstaged ? 'rotate-90' : ''}`} />
                        <span>Changes ({status.unstaged.length})</span>
                      </button>
                      {expandedSections.unstaged && (
                        <div className="mt-1 space-y-0.5 pl-5">
                          {status.unstaged.map((file) => (
                            <FileChangeItem
                              key={file.path}
                              file={file}
                              onClick={() => fetchDiff(file.path, false)}
                              isSelected={selectedFile?.path === file.path && selectedFile?.staged === false}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {status.isClean && (
                    <div className="text-center text-sm text-gray-500">
                      ✓ Working tree clean
                    </div>
                  )}
                </div>
              )}

              {/* Commit History */}
              {commits.length > 0 && (
                <div>
                  <button
                    onClick={() => toggleSection('history')}
                    className="flex w-full items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${expandedSections.history ? 'rotate-90' : ''}`} />
                    <span>History</span>
                  </button>
                  {expandedSections.history && (
                    <div className="mt-1 space-y-1 pl-5">
                      {commits.map((commit) => (
                        <div
                          key={commit.hash}
                          className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <code className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            {commit.shortHash}
                          </code>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-gray-800 dark:text-gray-100">
                              {commit.message}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-gray-500">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {commit.author}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {commit.relativeDate}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Diff View */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedFile ? (
            <>
              {/* Diff Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {selectedFile.path}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  ({selectedFile.staged ? 'staged' : 'unstaged'})
                </span>
              </div>

              {/* Diff Content */}
              <div className="flex-1 overflow-auto min-h-0">
                {diffLoading ? (
                  <div className="flex items-center justify-center h-32 text-sm text-gray-500">
                    Loading diff...
                  </div>
                ) : diffError ? (
                  <div className="flex items-center justify-center h-32 text-sm text-red-500">
                    {diffError}
                  </div>
                ) : !diffContent ? (
                  <div className="flex items-center justify-center h-32 text-sm text-gray-500">
                    No changes to display
                  </div>
                ) : (
                  <div className="h-full">
                    <DiffView
                      data={{
                        newFile: { fileName: selectedFile.path },
                        hunks: [diffContent],
                      }}
                      diffViewFontSize={12}
                      diffViewHighlight
                      diffViewMode={DiffModeEnum.Unified}
                      diffViewWrap
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Select a file to view diff
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </ModalPanel>
  );
}

interface FileChangeItemProps {
  file: GitFileChange;
  onClick?: () => void;
  isSelected?: boolean;
}

function FileChangeItem({ file, onClick, isSelected }: FileChangeItemProps) {
  const Icon = statusIcons[file.status];
  const color = statusColors[file.status];
  const label = statusLabels[file.status];

  const fileName = file.path.split('/').pop() || file.path;
  const directory = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left transition-colors ${
        isSelected
          ? 'bg-blue-100 dark:bg-blue-900/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <span className={`flex-shrink-0 w-3 text-center font-mono font-bold ${color}`}>
        {label}
      </span>
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${color}`} />
      <div className="min-w-0 flex-1 flex items-center gap-1">
        <span className="truncate text-gray-800 dark:text-gray-100" title={file.path}>
          {fileName}
        </span>
        {directory && (
          <span className="truncate text-gray-400 dark:text-gray-500" title={directory}>
            {directory}
          </span>
        )}
      </div>
    </button>
  );
}
