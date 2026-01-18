import { randomUUID } from 'crypto';
import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { logger as getLogger } from '../../shared/logger.js';
import { getStorageBackend } from '../database/redis.js';
import type { Task } from '../sessions/types.js';

const router: ExpressRouter = Router();
const logger = getLogger();

/**
 * GET /api/tasks - List tasks for a project
 * Query params:
 *   - project: project path (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.project as string;

    if (!projectPath) {
      res.status(400).json({ error: 'Project path is required' });
      return;
    }

    const storage = await getStorageBackend();
    const tasks = await storage.getTasks(projectPath);

    res.json({ tasks });
  } catch (err) {
    logger.error('Failed to list tasks', { err });
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * POST /api/tasks - Create a new task
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, column, projectPath, attachments } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Task title is required' });
      return;
    }

    if (!projectPath) {
      res.status(400).json({ error: 'Project path is required' });
      return;
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      title,
      description: description || undefined,
      column: column || 'backlog',
      projectPath,
      attachments: attachments || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const storage = await getStorageBackend();
    await storage.createTask(task);

    res.status(201).json({ task });
  } catch (err) {
    logger.error('Failed to create task', { err });
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PATCH /api/tasks/:id - Update a task
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, column, sessionId, attachments } = req.body;

    const updates: Partial<Omit<Task, 'id' | 'projectPath' | 'createdAt'>> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (column !== undefined) updates.column = column;
    if (sessionId !== undefined) updates.sessionId = sessionId;
    if (attachments !== undefined) updates.attachments = attachments;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    const storage = await getStorageBackend();
    const task = await storage.updateTask(id, updates);

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({ task });
  } catch (err) {
    logger.error('Failed to update task', { err });
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/tasks/:id - Delete (archive) a task
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const storage = await getStorageBackend();
    await storage.deleteTask(id);

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete task', { err });
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export { router as tasksRouter };
