import {
  Plus,
  Terminal,
  Trash2,
  Clock,
  Monitor,
  PlayCircle,
  Loader2,
  Columns2,
  Pencil,
  CheckCircle2,
  BrainCircuit,
  FolderOpen,
  ChevronDown
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useSessions } from '../hooks/useSessions';

export function DashboardPage() {
  const navigate = useNavigate();
  const { sessions, loading, error, createSession, createClaudeSession, deleteSession, renameSession, syncSessions } = useSessions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateClaudeModal, setShowCreateClaudeModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [permissionMode, setPermissionMode] = useState('default');
  const [creating, setCreating] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingSession, setRenamingSession] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [showNewSessionMenu, setShowNewSessionMenu] = useState(false);

  // Auto-sync on mount
  useEffect(() => {
    syncSessions().catch(err => {
      console.error('Failed to sync sessions:', err);
    });
  }, []);

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;

    setCreating(true);
    try {
      const session = await createSession(sessionName, 'bash');
      setShowCreateModal(false);
      setSessionName('');
      navigate(`/session/${session.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateClaudeSession = async () => {
    if (!sessionName.trim() || !workingDir.trim()) return;

    setCreating(true);
    try {
      const session = await createClaudeSession(sessionName, workingDir, permissionMode);
      setShowCreateClaudeModal(false);
      setSessionName('');
      setWorkingDir('');
      setPermissionMode('default');
      navigate(`/session/${session.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create Claude session');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, name: string) => {
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (!confirm(`Delete session "${name}"?`)) return;

    try {
      await deleteSession(sessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const handleOpenSplitView = () => {
    if (selectedSessions.size === 0) return;
    const sessionIds = Array.from(selectedSessions).join(',');
    navigate(`/session?ids=${sessionIds}`);
  };

  const handleRenameClick = (sessionId: string, currentName: string) => {
    setRenamingSession({ id: sessionId, name: currentName });
    setNewName(currentName);
    setShowRenameModal(true);
  };

  const handleRenameSession = async () => {
    if (!renamingSession || !newName.trim()) return;

    try {
      await renameSession(renamingSession.id, newName.trim());
      setShowRenameModal(false);
      setRenamingSession(null);
      setNewName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename session');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Terminal className="w-8 h-8 text-blue-500 flex-shrink-0" />
              <div className="hidden sm:block">
                <h1 className="text-2xl font-bold text-white">Vibehub Sessions</h1>
                <p className="text-sm text-gray-400">Manage your terminal sessions</p>
              </div>
            </div>
            <div className="flex gap-2">
              {selectedSessions.size > 0 && (
                <Button onClick={handleOpenSplitView} size="default" variant="secondary">
                  <Columns2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Split View ({selectedSessions.size})</span>
                  <span className="sm:hidden">{selectedSessions.size}</span>
                </Button>
              )}
              <div className="relative">
                <Button onClick={() => setShowNewSessionMenu(!showNewSessionMenu)} size="default">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New Session</span>
                  <span className="sm:hidden">New</span>
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
                {showNewSessionMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowNewSessionMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                      <button
                        onClick={() => {
                          setShowNewSessionMenu(false);
                          setShowCreateModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700 transition-colors rounded-t-lg"
                      >
                        <Terminal className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="font-medium text-white">Terminal Session</div>
                          <div className="text-xs text-gray-400">Traditional shell session</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setShowNewSessionMenu(false);
                          setShowCreateClaudeModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700 transition-colors rounded-b-lg border-t border-gray-700"
                      >
                        <BrainCircuit className="w-5 h-5 text-purple-500" />
                        <div>
                          <div className="font-medium text-white">Claude Code Session</div>
                          <div className="text-xs text-gray-400">AI-powered coding assistant</div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Loading sessions...</p>
            </div>
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Monitor className="w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No sessions yet</h3>
            <p className="text-gray-400 mb-6">Create your first terminal session to get started</p>
            <Button onClick={() => setShowCreateModal(true)} size="lg">
              <Plus className="w-4 h-4" />
              Create Session
            </Button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <>
            {selectedSessions.size > 0 && (
              <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                <p className="text-blue-200 text-sm">
                  {selectedSessions.size} session{selectedSessions.size !== 1 ? 's' : ''} selected for split view.
                  Click "Split View" to open them side-by-side.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sessions.map((session) => {
                const isSelected = selectedSessions.has(session.id);
                const isClaudeSession = session.type === 'claude';
                const SessionIcon = isClaudeSession ? BrainCircuit : Terminal;
                const iconColor = isClaudeSession ? 'text-purple-500' : 'text-blue-500';

                return (
                  <Card
                    key={session.id}
                    onClick={() => toggleSessionSelection(session.id)}
                    className={`cursor-pointer hover:border-blue-500/50 transition-all group ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/5' : ''
                    }`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="flex items-center gap-2">
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          )}
                          <SessionIcon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
                          <span className="truncate">{session.name}</span>
                        </CardTitle>
                        <Badge variant={session.status === 'active' ? 'success' : 'warning'}>
                          {session.status}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2 mt-2">
                        <Clock className="w-3 h-3" />
                        {formatDate(session.lastAccessedAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-gray-400 space-y-1">
                        {isClaudeSession ? (
                          <>
                            <p className="flex items-center gap-1">
                              <FolderOpen className="w-3 h-3" />
                              <span className="text-gray-300 truncate">{session.claudeMetadata?.workingDir || 'N/A'}</span>
                            </p>
                            <p>Mode: <span className="text-gray-300">{session.claudeMetadata?.permissionMode || 'default'}</span></p>
                          </>
                        ) : (
                          <>
                            <p>Command: <span className="text-gray-300">{session.metadata.command || 'bash'}</span></p>
                            <p>Size: <span className="text-gray-300">{session.metadata.cols}×{session.metadata.rows}</span></p>
                          </>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/session/${session.id}`);
                        }}
                        className="flex-1"
                        size="sm"
                      >
                        <PlayCircle className="w-4 h-4" />
                        {isClaudeSession ? 'Open' : 'Attach'}
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameClick(session.id, session.name);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id, session.name);
                        }}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Create Session Dialog */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Start a new terminal session with a custom name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Session Name
              </label>
              <Input
                placeholder="e.g., development, server-1, etc."
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => setShowCreateModal(false)}
                variant="outline"
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSession}
                disabled={!sessionName.trim() || creating}
              >
                {creating ? 'Creating...' : 'Create Session'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Claude Session Dialog */}
      <Dialog open={showCreateClaudeModal} onOpenChange={setShowCreateClaudeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-purple-500" />
              Create Claude Code Session
            </DialogTitle>
            <DialogDescription>
              Start a new AI-powered coding session with Claude Code
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Session Name
              </label>
              <Input
                placeholder="e.g., My Project, API Development, etc."
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Working Directory
              </label>
              <Input
                placeholder="/home/user/project"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                The directory where Claude Code will operate
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Permission Mode
              </label>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="default">Default (Ask for each tool)</option>
                <option value="acceptEdits">Accept Edits (Auto-approve file edits)</option>
                <option value="bypassPermissions">Bypass All (Auto-approve all tools)</option>
                <option value="plan">Plan Mode (No execution)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Controls how Claude asks for permission to use tools
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => {
                  setShowCreateClaudeModal(false);
                  setSessionName('');
                  setWorkingDir('');
                  setPermissionMode('default');
                }}
                variant="outline"
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateClaudeSession}
                disabled={!sessionName.trim() || !workingDir.trim() || creating}
              >
                {creating ? 'Creating...' : 'Create Session'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Session Dialog */}
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Enter a new name for "{renamingSession?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                New Name
              </label>
              <Input
                placeholder="Enter new session name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameSession()}
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => {
                  setShowRenameModal(false);
                  setRenamingSession(null);
                  setNewName('');
                }}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameSession}
                disabled={!newName.trim() || newName === renamingSession?.name}
              >
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
