import { GitBranch, RefreshCw, FileText, FilePlus, FileMinus, FileQuestion, Clock, User, ChevronRight, ChevronDown } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
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
      width="2xl"
      toolbar={
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchGitData}
          disabled={isLoading}
          className="h-6 w-6 p-0"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      }
    >
      {/* Content */}
      <div className="flex-1 overflow-auto p-3 bg-gray-900 min-h-0" style={{ maxHeight: '60vh' }}>
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
                className="flex w-full items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm hover:bg-gray-700"
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-white">
                    {status?.branch || 'Loading...'}
                  </span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showBranchList ? 'rotate-180' : ''}`} />
              </button>

              {showBranchList && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowBranchList(false)} />
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-gray-700 bg-gray-800 shadow-lg">
                    {branches.map((branch) => (
                      <div
                        key={branch.name}
                        className={`flex items-center gap-2 px-3 py-2 text-sm ${
                          branch.isCurrent
                            ? 'bg-blue-900/30 text-blue-300'
                            : 'text-gray-300 hover:bg-gray-700'
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
                      className="flex w-full items-center gap-1 text-sm font-medium text-gray-300 hover:text-white"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${expandedSections.staged ? 'rotate-90' : ''}`} />
                      <span>Staged ({status.staged.length})</span>
                    </button>
                    {expandedSections.staged && (
                      <div className="mt-1 space-y-0.5 pl-5">
                        {status.staged.map((file) => (
                          <FileChangeItem key={file.path} file={file} />
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
                      className="flex w-full items-center gap-1 text-sm font-medium text-gray-300 hover:text-white"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${expandedSections.unstaged ? 'rotate-90' : ''}`} />
                      <span>Changes ({status.unstaged.length})</span>
                    </button>
                    {expandedSections.unstaged && (
                      <div className="mt-1 space-y-0.5 pl-5">
                        {status.unstaged.map((file) => (
                          <FileChangeItem key={file.path} file={file} />
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
                  className="flex w-full items-center gap-1 text-sm font-medium text-gray-300 hover:text-white"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${expandedSections.history ? 'rotate-90' : ''}`} />
                  <span>History</span>
                </button>
                {expandedSections.history && (
                  <div className="mt-1 space-y-1 pl-5">
                    {commits.map((commit) => (
                      <div
                        key={commit.hash}
                        className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-gray-800"
                      >
                        <code className="flex-shrink-0 rounded bg-gray-800 px-1.5 py-0.5 font-mono text-gray-400">
                          {commit.shortHash}
                        </code>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-gray-100">
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
    </ModalPanel>
  );
}

function FileChangeItem({ file }: { file: GitFileChange }) {
  const Icon = statusIcons[file.status];
  const color = statusColors[file.status];
  const label = statusLabels[file.status];

  const fileName = file.path.split('/').pop() || file.path;
  const directory = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-800">
      <span className={`w-4 text-center font-mono font-bold ${color}`}>
        {label}
      </span>
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${color}`} />
      <span className="truncate text-gray-100" title={file.path}>
        {fileName}
      </span>
      {directory && (
        <span className="flex-shrink-0 truncate text-gray-400" title={directory}>
          {directory}
        </span>
      )}
    </div>
  );
}
