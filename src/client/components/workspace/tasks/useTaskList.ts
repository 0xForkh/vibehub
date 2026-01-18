import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import type { Task, TaskAttachment } from './types';

interface UseTaskListOptions {
  projectPath: string;
  onDeleteSession?: (sessionId: string) => void;
}

export function useTaskList({ projectPath, onDeleteSession }: UseTaskListOptions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.get(`/api/tasks?project=${encodeURIComponent(projectPath)}`);
      setTasks(response.data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const createTask = useCallback(async (title: string, description?: string, attachments?: TaskAttachment[]) => {
    const response = await api.post('/api/tasks', {
      title: title.trim(),
      description: description?.trim() || undefined,
      column: 'backlog',
      projectPath,
      attachments,
    });
    setTasks(prev => [...prev, response.data.task]);
    return response.data.task as Task;
  }, [projectPath]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const response = await api.patch(`/api/tasks/${taskId}`, updates);
    setTasks(prev => prev.map(t => t.id === taskId ? response.data.task : t));
    return response.data.task as Task;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await api.delete(`/api/tasks/${taskId}`);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const markDone = useCallback(async (task: Task) => {
    await deleteTask(task.id);
    if (task.sessionId && onDeleteSession) {
      onDeleteSession(task.sessionId);
    }
  }, [deleteTask, onDeleteSession]);

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    markDone,
  };
}
