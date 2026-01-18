export interface TaskAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  column: 'backlog' | 'todo' | 'review';
  projectPath: string;
  sessionId?: string;
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'pending' | 'doing' | 'review';

export function getTaskStatus(task: Task, validSessionIds?: Set<string>): TaskStatus {
  if (task.column === 'review') return 'review';
  if (task.sessionId && (!validSessionIds || validSessionIds.has(task.sessionId))) return 'doing';
  return 'pending';
}
