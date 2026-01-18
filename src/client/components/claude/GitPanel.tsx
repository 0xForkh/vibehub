import { GitBranch, RefreshCw, FileText, FilePlus, FileMinus, FileQuestion, Clock, User, ChevronRight, ChevronDown, ArrowLeft, GitCommitHorizontal } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Button } from '../ui/button';
import { ModalPanel } from '../ui/ModalPanel';

interface GitPanelProps {
  workingDir: string | undefined;
  isOpen: boolean;
  onClose: () => void;
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

export function GitPanel({ workingDir, isOpen, onClose }: GitPanelProps) {
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

  useEffect(() => {
    if (isOpen && workingDir) {
      fetchGitData();
    }
  }, [isOpen, workingDir, fetchGitData]);

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

  const closeDiffView = () => {
    setSelectedFile(null);
    setDiffContent(null);
    setDiffError(null);
  };

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

  const changeCount = status ? status.staged.length + status.unstaged.length : 0;

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
      width="4xl"
      toolbar={
        <div className="flex items-center gap-1">
          {changeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCommit}
              disabled={isLoading || isCommitting}
              className="h-6 gap-1 px-2 text-xs"
              title="Ask Claude to commit changes"
            >
              <GitCommitHorizontal className={`h-3 w-3 ${isCommitting ? 'animate-pulse' : ''}`} />
              {isCommitting ? 'Committing...' : 'Commit'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchGitData}
            disabled={isLoading || isCommitting}
            className="h-6 w-6 p-0"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
    >
      {/* Content */}
      <div className="flex-1 overflow-auto bg-white min-h-0 dark:bg-gray-900" style={{ maxHeight: '70vh' }}>
        {selectedFile ? (
          // Diff View
          <div className="flex flex-col h-full">
            {/* Diff Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={closeDiffView}
                className="h-6 w-6 p-0"
                title="Back to file list"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {selectedFile.path}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({selectedFile.staged ? 'staged' : 'unstaged'})
              </span>
            </div>

            {/* Diff Content */}
            <div className="flex-1 overflow-auto">
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
                <DiffView
                  data={{
                    newFile: { fileName: selectedFile.path },
                    hunks: [diffContent],
                  }}
                  diffViewFontSize={12}
                  diffViewHighlight
                  diffViewMode={DiffModeEnum.Unified}
                />
              )}
            </div>
          </div>
        ) : isCommitting || commitResult ? (
          // Committing / Result View
          <div className="p-3">
            {/* Status header */}
            <div className={`rounded-md p-3 mb-3 ${
              commitResult
                ? commitResult.success
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
                : 'bg-blue-50 dark:bg-blue-900/20'
            }`}>
              <div className="flex items-center gap-2">
                {isCommitting && (
                  <GitCommitHorizontal className="h-4 w-4 animate-pulse text-blue-500" />
                )}
                <div className={`text-sm font-medium ${
                  commitResult
                    ? commitResult.success
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-red-700 dark:text-red-300'
                    : 'text-blue-700 dark:text-blue-300'
                }`}>
                  {commitResult
                    ? commitResult.success
                      ? '✓ Commit successful'
                      : `✗ ${commitResult.error || 'Commit failed'}`
                    : commitStatus || 'Starting...'}
                </div>
              </div>
            </div>

            {/* Messages from Claude */}
            {commitMessages.length > 0 && (
              <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 mb-3 max-h-64 overflow-y-auto">
                <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {commitMessages.map((msg, i) => (
                    <div key={i} className={i > 0 ? 'mt-2 pt-2 border-t border-gray-100 dark:border-gray-800' : ''}>
                      {msg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Back button (only when done) */}
            {commitResult && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCommitResult(null);
                  setCommitMessages([]);
                  setCommitStatus('');
                }}
                className="w-full"
              >
                Back to changes
              </Button>
            )}
          </div>
        ) : (
          // File List View
          <div className="p-3">
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
                      <span className="font-medium text-gray-900 dark:text-white">
                        {status?.branch || 'Loading...'}
                      </span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showBranchList ? 'rotate-180' : ''}`} />
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
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-left transition-colors ${
        isSelected
          ? 'bg-blue-100 dark:bg-blue-900/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <span className={`w-4 text-center font-mono font-bold ${color}`}>
        {label}
      </span>
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${color}`} />
      <span className="truncate text-gray-800 dark:text-gray-100" title={file.path}>
        {fileName}
      </span>
      {directory && (
        <span className="flex-shrink-0 truncate text-gray-500 dark:text-gray-400" title={directory}>
          {directory}
        </span>
      )}
    </button>
  );
}
