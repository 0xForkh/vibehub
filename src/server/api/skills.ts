/**
 * Skills API
 *
 * REST endpoints for listing and invoking Vibehub skills.
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { getSkills, getSkill, renderSkillPrompt } from '../skills/index.js';

const router: ExpressRouter = Router();

/**
 * GET /api/skills - List all available skills
 */
router.get('/', (_req: Request, res: Response) => {
  const skills = getSkills().map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
  }));

  res.json({ skills });
});

/**
 * GET /api/skills/:id - Get a specific skill
 */
router.get('/:id', (req: Request, res: Response) => {
  const skill = getSkill(req.params.id);

  if (!skill) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }

  res.json({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
  });
});

/**
 * POST /api/skills/:id/prompt - Get the rendered prompt for a skill
 * Body:
 *   - workingDir: string (required) - The working directory for context
 *
 * Returns the prompt that should be sent to the Claude session.
 * The client is responsible for sending this prompt via the socket.
 */
router.post('/:id/prompt', (req: Request, res: Response) => {
  const skill = getSkill(req.params.id);

  if (!skill) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }

  const { workingDir } = req.body;

  if (!workingDir) {
    res.status(400).json({ error: 'workingDir is required' });
    return;
  }

  const prompt = renderSkillPrompt(skill, { workingDir });

  res.json({ prompt });
});

export { router as skillsRouter };
