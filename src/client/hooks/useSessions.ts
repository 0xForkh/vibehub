import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { api } from '../lib/api';

export interface Session {
  id: string;
  name: string;
  type: 'terminal' | 'claude';
  tmuxSessionName: string;
  createdAt: string;
  lastAccessedAt: string;
  metadata: {
    cols: number;
    rows: number;
    command?: string;
  };
  claudeMetadata?: {
    workingDir: string;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    claudeSessionId?: string;
    worktreePath?: string; // If session was created with a git worktree
    currentBranch?: string; // Current git branch
  };
  status: 'active' | 'detached';
}

export interface WorktreeOptions {
  branch: string;
  path?: string; // Custom relative path, defaults to .worktrees/<branch>
}

export function useSessions() {
  const { socket } = useSocket();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      }
      const response = await api.get('/api/sessions');
      setSessions(response.data.sessions || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSessions(true);
  }, [fetchSessions]);

  // Listen for session updates via socket
  useEffect(() => {
    if (!socket) return undefined;

    const handleSessionsUpdated = () => {
      fetchSessions(false);
    };

    socket.on('sessions:updated', handleSessionsUpdated);

    return () => {
      socket.off('sessions:updated', handleSessionsUpdated);
    };
  }, [socket, fetchSessions]);

  const createSession = async (name: string, command?: string) => {
    try {
      const response = await api.post('/api/sessions', {
        name,
        command: command || 'bash',
        cols: 80,
        rows: 24,
      });
      await fetchSessions(false);
      return response.data.session;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const deleteSession = async (sessionId: string, cleanupWorktree = false) => {
    try {
      const params = cleanupWorktree ? '?cleanupWorktree=true' : '';
      await api.delete(`/api/sessions/${sessionId}${params}`);
      await fetchSessions(false);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  const renameSession = async (sessionId: string, name: string) => {
    try {
      await api.put(`/api/sessions/${sessionId}`, { name });
      await fetchSessions(false);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to rename session');
    }
  };

  const syncSessions = async () => {
    try {
      const response = await api.post('/api/sessions/sync');
      setSessions(response.data.sessions || []);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to sync sessions');
    }
  };

  const createClaudeSession = async (
    name: string,
    workingDir: string,
    permissionMode?: string,
    worktree?: WorktreeOptions
  ) => {
    try {
      const response = await api.post('/api/sessions/claude', {
        name,
        workingDir,
        permissionMode: permissionMode || 'default',
        cols: 80,
        rows: 24,
        worktree, // Optional: { branch, path? }
      });
      await fetchSessions(false);
      return response.data.session;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create Claude session');
    }
  };

  return {
    sessions,
    loading,
    error,
    createSession,
    createClaudeSession,
    deleteSession,
    renameSession,
    syncSessions,
    refresh: fetchSessions,
  };
}
