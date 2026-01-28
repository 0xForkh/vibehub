/**
 * Vibehub Skills System
 *
 * Skills are predefined prompts that can be triggered from the UI.
 * They are sent to the active Claude session with context about the current project.
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string; // Lucide icon name
  /** The prompt template. Use {{workingDir}} for the current working directory */
  prompt: string;
}

/**
 * Built-in skills provided by Vibehub
 */
export const skills: Skill[] = [
  {
    id: 'init-preview',
    name: 'Initialize Preview',
    description: 'Create Docker configuration for preview environments',
    icon: 'Container',
    prompt: `# Initialize Preview Environment

Create Docker configuration files in the \`.vibehub/\` folder for the preview feature.

## Current Project
Working directory: {{workingDir}}

## Your Task

1. **Analyze the project** by reading relevant files:
   - \`package.json\` (dependencies, scripts, engines)
   - \`docker-compose.yml\` or \`docker-compose.yaml\` (if exists - use as reference)
   - \`Dockerfile\` (if exists - use as reference)
   - \`.env.example\` or \`.env.sample\` (environment variables needed)
   - \`README.md\` (setup instructions)
   - \`prisma/schema.prisma\` (if exists - database requirements)

2. **Determine required services** based on dependencies:
   - PostgreSQL if using \`pg\`, \`prisma\`, \`typeorm\`, \`sequelize\`, etc.
   - Redis if using \`redis\`, \`ioredis\`, \`bull\`, etc.
   - MongoDB if using \`mongoose\`, \`mongodb\`, etc.
   - Other services as needed

3. **Generate two files** in the \`.vibehub/\` folder:

### \`.vibehub/Dockerfile\`

Create a Dockerfile appropriate for the project's tech stack:
- Use the correct base image (node, python, go, etc.)
- Install necessary build tools for native modules
- Set up the working directory
- The CMD should install dependencies and start the dev server
- Source code will be mounted as a volume, so don't COPY it

### \`.vibehub/docker-compose.yml\`

Create a docker-compose.yml with these requirements:
- **CRITICAL**: The dev service must use \`\${PREVIEW_PORT}\` for the external port
- Mount source code as volume for hot reload: \`- ..:/app\`
- Use \`context: ..\` and \`dockerfile: .vibehub/Dockerfile\`
- Include healthchecks for database services
- Set appropriate environment variables

**Example structure:**

\`\`\`yaml
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

  dev:
    build:
      context: ..
      dockerfile: .vibehub/Dockerfile
    ports:
      - "\${PREVIEW_PORT}:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://app:app@postgres:5432/app
    volumes:
      - ..:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
\`\`\`

4. **Write the files** using the Write tool to:
   - \`.vibehub/Dockerfile\`
   - \`.vibehub/docker-compose.yml\`

Remember: Use the working directory specified above for all paths.`,
  },
];

/**
 * Get all available skills
 */
export function getSkills(): Skill[] {
  return skills;
}

/**
 * Get a skill by ID
 */
export function getSkill(id: string): Skill | undefined {
  return skills.find(s => s.id === id);
}

/**
 * Render a skill prompt with context
 */
export function renderSkillPrompt(skill: Skill, context: { workingDir: string }): string {
  return skill.prompt.replace(/\{\{workingDir\}\}/g, context.workingDir);
}
