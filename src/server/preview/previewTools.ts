/**
 * Preview Tools
 *
 * MCP tools for managing preview environments.
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { logger as getLogger } from '../../shared/logger.js';
import { getPreviewManager } from './PreviewManager.js';

const logger = getLogger();

const DOCKER_COMPOSE_TEMPLATE = `# Preview environment for Vibehub worktrees
# Environment variable provided by Vibehub:
#   PREVIEW_PORT - External port exposed via Caddy
#
# Usage: docker compose -p preview-{sessionId} up -d --build

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  dev:
    build:
      context: ..
      dockerfile: .vibehub/Dockerfile
    ports:
      - "\${PREVIEW_PORT}:3000"
    environment:
      NODE_ENV: development
      PORT: 3001
      API_PORT: 3001
      VITE_PORT: 3000
      DATABASE_URL: postgresql://app:app@postgres:5432/app
      REDIS_URL: redis://redis:6379
{{EXTRA_ENV}}
    volumes:
      - ..:/app
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;

const DOCKERFILE_TEMPLATE = `# Preview Dockerfile for Vibehub worktrees
# Runs dev servers in a single container
# Source code is mounted as a volume for hot reload

FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Expose the dev server port
EXPOSE 3000

# Install deps and start dev
CMD ["sh", "-c", "{{STARTUP_CMD}}"]
`;

interface ProjectAnalysis {
  name: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  hasBackend: boolean;
  hasPrisma: boolean;
  extraEnvVars: Record<string, string>;
  startupCommands: string[];
}

/**
 * Analyze a project to suggest preview configuration
 */
async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    name: '',
    packageManager: 'npm',
    hasBackend: false,
    hasPrisma: false,
    extraEnvVars: {},
    startupCommands: [],
  };

  // Detect package manager
  try {
    await access(join(projectPath, 'pnpm-lock.yaml'));
    analysis.packageManager = 'pnpm';
  } catch {
    try {
      await access(join(projectPath, 'yarn.lock'));
      analysis.packageManager = 'yarn';
    } catch {
      try {
        await access(join(projectPath, 'bun.lockb'));
        analysis.packageManager = 'bun';
      } catch {
        analysis.packageManager = 'npm';
      }
    }
  }

  // Get project name from package.json or directory name
  try {
    const pkgPath = join(projectPath, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    analysis.name = pkg.name || projectPath.split('/').pop() || 'my-project';
  } catch {
    analysis.name = projectPath.split('/').pop() || 'my-project';
  }

  // Sanitize name
  analysis.name = analysis.name.replace(/[^a-zA-Z0-9-]/g, '-');

  // Check for backend folder (monorepo structure)
  try {
    await access(join(projectPath, 'backend'));
    analysis.hasBackend = true;

    // Check for Prisma
    try {
      await access(join(projectPath, 'backend', 'prisma'));
      analysis.hasPrisma = true;
    } catch {
      // No prisma
    }
  } catch {
    // No backend folder - single app structure
    try {
      await access(join(projectPath, 'prisma'));
      analysis.hasPrisma = true;
    } catch {
      // No prisma
    }
  }

  // Build startup commands
  const pm = analysis.packageManager;
  const installCmd = pm === 'npm' ? 'npm install' : `${pm} install`;

  analysis.startupCommands.push(installCmd);

  if (analysis.hasPrisma) {
    if (analysis.hasBackend) {
      analysis.startupCommands.push('cd backend && npx prisma generate && npx prisma migrate deploy && cd /app');
    } else {
      analysis.startupCommands.push('npx prisma generate && npx prisma migrate deploy');
    }
  }

  const devCmd = pm === 'npm' ? 'npm run dev' : `${pm} dev`;
  analysis.startupCommands.push(devCmd);

  // Check for .env.example to extract extra env vars
  try {
    const envPath = join(projectPath, '.env.example');
    const envContent = await readFile(envPath, 'utf-8');

    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      // eslint-disable-next-line no-continue
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      // eslint-disable-next-line no-continue
      if (!key) continue;

      const value = valueParts.join('=');

      // Skip standard env vars that are already in template
      const standardKeys = ['DATABASE_URL', 'REDIS_URL', 'NODE_ENV', 'PORT'];
      // eslint-disable-next-line no-continue
      if (standardKeys.includes(key)) continue;

      // Add app-specific env vars
      analysis.extraEnvVars[key] = value || 'TODO';
    }
  } catch {
    // No .env.example
  }

  return analysis;
}

/**
 * Generate docker-compose.yml content from analysis
 */
function generateDockerCompose(analysis: ProjectAnalysis): string {
  // Generate extra env vars
  const envLines: string[] = [];
  for (const [key, value] of Object.entries(analysis.extraEnvVars)) {
    envLines.push(`      ${key}: ${value}`);
  }

  const extraEnv = envLines.length > 0 ? envLines.join('\n') : '      # Add app-specific env vars here';

  return DOCKER_COMPOSE_TEMPLATE.replace('{{EXTRA_ENV}}', extraEnv);
}

/**
 * Generate Dockerfile content from analysis
 */
function generateDockerfile(analysis: ProjectAnalysis): string {
  const startupCmd = analysis.startupCommands.join(' && ');
  return DOCKERFILE_TEMPLATE.replace('{{STARTUP_CMD}}', startupCmd);
}

/**
 * Creates an MCP server with preview management tools
 */
export function createPreviewToolsServer(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: 'preview-tools',
    version: '1.0.0',
    tools: [
      // Tool: init_preview_config
      tool(
        'init_preview_config',
        `Analyze a project and generate a .vibehub/preview.yaml configuration file for automatic dev environment setup in worktrees.

This tool analyzes docker-compose.yml, package.json, and .env.example to suggest services and port mappings.

IMPORTANT: The generated config is a starting point. You should review and adjust it based on the project's needs.

Key configuration concepts:
- **services**: Define docker containers and process services
  - Docker services: Need 'image', 'internal_port', 'offset', optionally 'environment' and 'volumes'
  - Process services: Need 'command', 'offset', optionally 'expose: true' for Caddy routing
- **offset**: Port offset from base_port. Port = base_port + (slot × slot_increment) + offset
- **expose**: Set to true on ONE service to get a Caddy reverse proxy route (typically the frontend)
- **expose_offset**: If the exposed port differs from main service port (e.g., frontend runs on different port than API)
- **setup**: Array of commands to run before starting the service. First command runs parallel with Docker health checks.
  - Use 'npx dotenv-cli -e .env -- <command>' to run commands that need the generated .env file
  - Example: ['pnpm install', 'npx dotenv-cli -e .env -- npx prisma migrate deploy']
- **env**: Environment variables template with port references like \${service.port}, \${service.expose_port}, \${preview_url}

For monorepos with concurrently-based dev scripts, consider using a single 'dev' service that runs everything together instead of separate services.`,
        {
          projectPath: z.string().describe('Path to the project root directory'),
          dryRun: z.boolean().optional().describe('If true, only show what would be generated without writing the file'),
        },
        async (args) => {
          logger.info('init_preview_config tool called', { projectPath: args.projectPath });

          try {
            const vibehubDir = join(args.projectPath, '.vibehub');
            const composePath = join(vibehubDir, 'docker-compose.yml');
            const dockerfilePath = join(vibehubDir, 'Dockerfile');

            // Check if config already exists
            try {
              await access(composePath);
              if (!args.dryRun) {
                return {
                  content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                      success: false,
                      error: 'Preview config already exists at .vibehub/docker-compose.yml. Delete it first or edit it manually.',
                      existingPath: composePath,
                    }),
                  }],
                };
              }
            } catch {
              // Config doesn't exist, good to proceed
            }

            // Analyze the project
            const analysis = await analyzeProject(args.projectPath);

            // Generate the files
            const composeContent = generateDockerCompose(analysis);
            const dockerfileContent = generateDockerfile(analysis);

            if (args.dryRun) {
              return {
                content: [{
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: true,
                    dryRun: true,
                    analysis: {
                      name: analysis.name,
                      packageManager: analysis.packageManager,
                      hasBackend: analysis.hasBackend,
                      hasPrisma: analysis.hasPrisma,
                    },
                    files: {
                      'docker-compose.yml': composeContent,
                      'Dockerfile': dockerfileContent,
                    },
                  }),
                }],
              };
            }

            // Write the files
            await mkdir(vibehubDir, { recursive: true });
            await writeFile(composePath, composeContent);
            await writeFile(dockerfilePath, dockerfileContent);

            logger.info('Preview config generated', { composePath, dockerfilePath });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  files: [composePath, dockerfilePath],
                  analysis: {
                    name: analysis.name,
                    packageManager: analysis.packageManager,
                    hasBackend: analysis.hasBackend,
                    hasPrisma: analysis.hasPrisma,
                  },
                  message: 'Preview config created. Review and adjust the generated .vibehub/docker-compose.yml and .vibehub/Dockerfile files.',
                }),
              }],
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            logger.error('Failed to generate preview config', { error });
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Failed to generate preview config: ${error}`,
                }),
              }],
            };
          }
        },
      ),

      // Tool: restart_preview_service
      tool(
        'restart_preview_service',
        'Restart a specific service in the preview environment (docker container or dev server process).',
        {
          sessionId: z.string().describe('Session ID that owns the preview environment'),
          serviceName: z.string().describe('Name of the service to restart'),
        },
        async (args) => {
          logger.info('restart_preview_service tool called', args);

          const previewManager = getPreviewManager();
          const state = previewManager.getPreviewState(args.sessionId);

          if (!state) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No preview environment found for this session',
                }),
              }],
            };
          }

          try {
            // Use docker-compose to restart the service
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            const cmd = `docker compose -p ${state.projectName} restart ${args.serviceName}`;
            await execAsync(cmd);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: `Service '${args.serviceName}' restarted`,
                }),
              }],
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Failed to restart service: ${error}`,
                }),
              }],
            };
          }
        },
      ),

      // Tool: get_preview_logs
      tool(
        'get_preview_logs',
        'Get recent logs from a preview service (docker container or tmux process).',
        {
          sessionId: z.string().describe('Session ID that owns the preview environment'),
          serviceName: z.string().describe('Name of the service to get logs from'),
          lines: z.number().optional().describe('Number of lines to retrieve (default: 50)'),
        },
        async (args) => {
          logger.info('get_preview_logs tool called', args);

          const previewManager = getPreviewManager();
          const state = previewManager.getPreviewState(args.sessionId);

          if (!state) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No preview environment found for this session',
                }),
              }],
            };
          }

          const lines = args.lines || 50;

          try {
            const logs = await previewManager.getLogs(args.sessionId, args.serviceName, lines);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  serviceName: args.serviceName,
                  logs,
                }),
              }],
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Failed to get logs: ${error}`,
                }),
              }],
            };
          }
        },
      ),
    ],
  });
}
