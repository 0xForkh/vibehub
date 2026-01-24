/**
 * Preview Tools
 *
 * MCP tools for managing preview environments.
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import YAML from 'yaml';
import { z } from 'zod';
import { logger as getLogger } from '../../shared/logger.js';
import { getPreviewManager } from './PreviewManager.js';

const logger = getLogger();

const PREVIEW_YAML_TEMPLATE = `# Vibehub Preview Configuration
# Ports are randomly allocated at runtime - no manual offset management needed.
#
# Service types:
# - docker: Start a container (postgres, redis, etc.)
# - process: Start a dev server command
# - port: Just allocate a port (for multi-port apps)
#
# Key concepts:
# - expose: true on ONE process service to get a Caddy route
# - setup: Commands run before starting (first runs parallel with Docker health checks)
# - \${service.port}: Resolves to the randomly allocated port
# - \${preview_url}: The full preview URL
#
# For apps with separate frontend/backend, use Vite's proxy to route /api to backend.

name: {{PROJECT_NAME}}

services:
{{SERVICES}}

# Environment variables template
env:
{{ENV_VARS}}
`;

interface AnalyzedService {
  name: string;
  type: 'docker' | 'process' | 'port';
  image?: string;
  internal_port?: number;
  command?: string;
  expose?: boolean;
  environment?: Record<string, string>;
  volumes?: string[];
}

interface ProjectAnalysis {
  name: string;
  services: AnalyzedService[];
  envVars: Record<string, string>;
}

/**
 * Analyze a project to suggest preview configuration
 */
async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    name: '',
    services: [],
    envVars: {},
  };

  // Get project name from package.json or directory name
  try {
    const pkgPath = join(projectPath, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    analysis.name = pkg.name || dirname(projectPath).split('/').pop() || 'my-project';
  } catch {
    analysis.name = dirname(projectPath).split('/').pop() || 'my-project';
  }

  // Sanitize name for use in configs
  analysis.name = analysis.name.replace(/[^a-zA-Z0-9-]/g, '-');

  // Check for docker-compose.yml
  try {
    const composePath = join(projectPath, 'docker-compose.yml');
    await access(composePath);
    const composeContent = await readFile(composePath, 'utf-8');
    const compose = YAML.parse(composeContent);

    if (compose.services) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [serviceName, serviceConfig] of Object.entries(compose.services as Record<string, any>)) {
        // Skip services that are typically shared (like minio/s3)
        if (serviceName.includes('minio') || serviceName.includes('s3')) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const service: AnalyzedService = {
          name: serviceName,
          type: 'docker',
          image: serviceConfig.image,
        };

        // Extract internal port from port mapping
        if (serviceConfig.ports && serviceConfig.ports.length > 0) {
          const portMapping = serviceConfig.ports[0];
          const match = String(portMapping).match(/(\d+):(\d+)/);
          if (match) {
            service.internal_port = parseInt(match[2], 10);
          }
        }

        // Extract environment
        if (serviceConfig.environment) {
          service.environment = {};
          if (Array.isArray(serviceConfig.environment)) {
            for (const env of serviceConfig.environment) {
              const [key, value] = env.split('=');
              service.environment[key] = value;
            }
          } else {
            service.environment = serviceConfig.environment;
          }
        }

        // Extract volumes
        if (serviceConfig.volumes) {
          service.volumes = serviceConfig.volumes.filter((v: string) => !v.startsWith('/') && !v.startsWith('.'));
        }

        analysis.services.push(service);
      }
    }
  } catch {
    // No docker-compose, that's fine
  }

  // Check for package.json scripts to detect dev servers
  try {
    const pkgPath = join(projectPath, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    if (pkg.scripts) {
      // Look for a "dev" script that runs everything
      if (pkg.scripts.dev) {
        analysis.services.push({
          name: 'dev',
          type: 'process',
          command: 'npm run dev',
          expose: true, // Gets Caddy route
        });
      }
    }
  } catch {
    // No package.json scripts
  }

  // Check for .env.example to suggest env vars
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

      // Replace localhost port references with service port templates
      const portMatch = value.match(/localhost:(\d+)/);
      if (portMatch) {
        // Try to find a matching service by common port patterns
        const port = parseInt(portMatch[1], 10);
        let serviceName: string | null = null;

        if (port === 5432) serviceName = 'postgres';
        else if (port === 6379) serviceName = 'redis';
        else if (port === 1025) serviceName = 'mailhog';

        if (serviceName && analysis.services.some(s => s.name === serviceName)) {
          analysis.envVars[key] = value.replace(/localhost:\d+/, `localhost:\${${  serviceName  }.port}`);
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      // Use preview_url for URL variables
      if (key.includes('URL') && !value.includes('localhost')) {
        // eslint-disable-next-line camelcase
        analysis.envVars[key] = String.raw`${preview_url}`;
      } else {
        analysis.envVars[key] = value;
      }
    }
  } catch {
    // No .env.example
  }

  return analysis;
}

/**
 * Generate preview.yaml content from analysis
 */
function generatePreviewYaml(analysis: ProjectAnalysis): string {
  // Generate services section
  const servicesLines: string[] = [];
  for (const service of analysis.services) {
    servicesLines.push(`  ${service.name}:`);
    servicesLines.push(`    type: ${service.type}`);

    if (service.type === 'docker') {
      servicesLines.push(`    image: ${service.image}`);
      servicesLines.push(`    internal_port: ${service.internal_port}`);

      if (service.environment && Object.keys(service.environment).length > 0) {
        servicesLines.push('    environment:');
        for (const [key, value] of Object.entries(service.environment)) {
          servicesLines.push(`      ${key}: ${value}`);
        }
      }

      if (service.volumes && service.volumes.length > 0) {
        servicesLines.push('    volumes:');
        for (const vol of service.volumes) {
          servicesLines.push(`      - ${vol}`);
        }
      }
    } else if (service.type === 'process') {
      servicesLines.push(`    command: ${service.command}`);
      if (service.expose) {
        servicesLines.push('    expose: true');
      }
    }
    // type: 'port' services just need the type line

    servicesLines.push('');
  }

  // Generate env section
  const envLines: string[] = [];
  for (const [key, value] of Object.entries(analysis.envVars)) {
    envLines.push(`  ${key}: "${value}"`);
  }

  return PREVIEW_YAML_TEMPLATE
    .replace('{{PROJECT_NAME}}', analysis.name)
    .replace('{{SERVICES}}', servicesLines.join('\n'))
    .replace('{{ENV_VARS}}', envLines.join('\n'));
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
            // Check if preview.yaml already exists
            const configPath = join(args.projectPath, '.vibehub', 'preview.yaml');
            try {
              await access(configPath);
              if (!args.dryRun) {
                return {
                  content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                      success: false,
                      error: 'Preview config already exists at .vibehub/preview.yaml. Delete it first or edit it manually.',
                      existingPath: configPath,
                    }),
                  }],
                };
              }
            } catch {
              // Config doesn't exist, good to proceed
            }

            // Analyze the project
            const analysis = await analyzeProject(args.projectPath);

            if (analysis.services.length === 0) {
              return {
                content: [{
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: 'Could not detect any services. Make sure the project has a docker-compose.yml or package.json with dev scripts.',
                    suggestion: 'You can manually create .vibehub/preview.yaml based on the template.',
                  }),
                }],
              };
            }

            // Generate the YAML content
            const yamlContent = generatePreviewYaml(analysis);

            if (args.dryRun) {
              return {
                content: [{
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: true,
                    dryRun: true,
                    analysis: {
                      name: analysis.name,
                      services: analysis.services.map(s => s.name),
                      serviceCount: analysis.services.length,
                    },
                    generatedContent: yamlContent,
                  }),
                }],
              };
            }

            // Write the file
            await mkdir(join(args.projectPath, '.vibehub'), { recursive: true });
            await writeFile(configPath, yamlContent);

            logger.info('Preview config generated', { configPath });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  configPath,
                  analysis: {
                    name: analysis.name,
                    services: analysis.services.map(s => s.name),
                    serviceCount: analysis.services.length,
                  },
                  message: 'Preview config created. Review and adjust the generated .vibehub/preview.yaml file.',
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
