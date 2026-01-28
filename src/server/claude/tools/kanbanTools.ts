import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { logger as getLogger } from '../../../shared/logger.js';
import type { StorageBackend } from '../../database/StorageBackend.js';

const logger = getLogger();

/**
 * Context required for kanban tools to operate
 */
export interface KanbanToolsContext {
  storage: StorageBackend;
  currentSessionId: string;
}

/**
 * Creates an MCP server with kanban task management tools
 */
export function createKanbanToolsServer(context: KanbanToolsContext): McpSdkServerConfigWithInstance {
  const { storage, currentSessionId } = context;

  return createSdkMcpServer({
    name: 'kanban-tools',
    version: '1.0.0',
    tools: [
      // NOTE: get_linked_task removed - Claude was calling it unnecessarily at session start
      // The functionality is still available via update_task_status and complete_task which
      // auto-detect the linked task when taskId is not provided.

      // Tool 1: update_task_status
      tool(
        'update_task_status',
        'Update the status of a task. Use column "review" to mark a task as ready for review when you have completed the work.',
        {
          taskId: z.string().optional().describe('Task ID to update. If not provided, updates the task linked to current session.'),
          column: z.enum(['backlog', 'todo', 'review']).describe('Target status: "review" marks task as ready for review'),
        },
        async (args) => {
          logger.info('update_task_status tool called', { args, sessionId: currentSessionId });

          let {taskId} = args;

          // If no taskId provided, find the task linked to this session
          if (!taskId) {
            const allKeys = await storage.keys('task:*');
            for (const key of allKeys) {
              const id = key.replace('task:', '');
              const task = await storage.getTask(id);
              if (task && task.sessionId === currentSessionId) {
                taskId = id;
                break;
              }
            }
          }

          if (!taskId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No task ID provided and no task is linked to this session',
                }),
              }],
            };
          }

          const updatedTask = await storage.updateTask(taskId, { column: args.column });

          if (!updatedTask) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Task not found',
                }),
              }],
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task: {
                  id: updatedTask.id,
                  title: updatedTask.title,
                  column: updatedTask.column,
                  updatedAt: updatedTask.updatedAt,
                },
              }),
            }],
          };
        }
      ),

      // Tool 3: complete_task
      tool(
        'complete_task',
        'Mark a kanban task as done and archive it (removes from board). Use this when the task is fully completed.',
        {
          taskId: z.string().optional().describe('Task ID to complete. If not provided, completes the task linked to current session.'),
        },
        async (args) => {
          logger.info('complete_task tool called', { args, sessionId: currentSessionId });

          let {taskId} = args;

          // If no taskId provided, find the task linked to this session
          if (!taskId) {
            const allKeys = await storage.keys('task:*');
            for (const key of allKeys) {
              const id = key.replace('task:', '');
              const task = await storage.getTask(id);
              if (task && task.sessionId === currentSessionId) {
                taskId = id;
                break;
              }
            }
          }

          if (!taskId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No task ID provided and no task is linked to this session',
                }),
              }],
            };
          }

          const task = await storage.getTask(taskId);
          if (!task) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Task not found',
                }),
              }],
            };
          }

          // Delete the task (archive = remove from board)
          await storage.deleteTask(taskId);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Task "${task.title}" has been marked as done and archived`,
                taskTitle: task.title,
              }),
            }],
          };
        }
      ),

      // Tool 4: list_project_tasks
      tool(
        'list_project_tasks',
        'List all kanban tasks for a project, optionally filtered by column.',
        {
          projectPath: z.string().describe('Project path to list tasks for'),
          column: z.enum(['backlog', 'todo', 'review']).optional().describe('Filter by column'),
        },
        async (args) => {
          logger.info('list_project_tasks tool called', { args });

          const tasks = await storage.getTasks(args.projectPath);

          const filteredTasks = args.column
            ? tasks.filter(t => t.column === args.column)
            : tasks;

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                projectPath: args.projectPath,
                column: args.column || 'all',
                count: filteredTasks.length,
                tasks: filteredTasks.map(t => ({
                  id: t.id,
                  title: t.title,
                  description: t.description,
                  column: t.column,
                  sessionId: t.sessionId,
                  createdAt: t.createdAt,
                })),
              }),
            }],
          };
        }
      ),

      // Tool 5: create_task
      tool(
        'create_task',
        'Create a new kanban task for a project. The task will be added to the specified column.',
        {
          projectPath: z.string().describe('Project path to create the task in'),
          title: z.string().describe('Task title'),
          description: z.string().optional().describe('Task description'),
          column: z.enum(['backlog', 'todo', 'review']).default('backlog').describe('Column to place the task in (defaults to backlog)'),
        },
        async (args) => {
          logger.info('create_task tool called', { args });

          const taskId = crypto.randomUUID();
          const now = new Date().toISOString();

          const task = {
            id: taskId,
            title: args.title,
            description: args.description,
            column: args.column,
            projectPath: args.projectPath,
            createdAt: now,
            updatedAt: now,
          };

          await storage.createTask(task);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task: {
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  column: task.column,
                  projectPath: task.projectPath,
                  createdAt: task.createdAt,
                },
              }),
            }],
          };
        }
      ),
    ],
  });
}
