import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { logger as getLogger } from '../../shared/logger.js';
import { FileSystemService } from '../claude/FileSystemService.js';

const router: ExpressRouter = Router();
const logger = getLogger();

/**
 * GET /api/files/list - List directory contents
 * Query params:
 *   - path: base directory path (required)
 *   - subpath: subdirectory to list (optional, defaults to '.')
 *   - showHidden: show hidden files (optional, defaults to false)
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const basePath = req.query.path as string;
    const subpath = (req.query.subpath as string) || '.';
    const showHidden = req.query.showHidden === 'true';

    if (!basePath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    const fsService = new FileSystemService(basePath);
    const entries = await fsService.listDirectory(subpath, showHidden);

    res.json({ entries });
  } catch (err) {
    logger.error('Failed to list directory', { err });
    res.status(500).json({ error: 'Failed to list directory' });
  }
});

/**
 * GET /api/files/read - Read file contents
 * Query params:
 *   - path: base directory path (required)
 *   - file: relative file path to read (required)
 */
router.get('/read', async (req: Request, res: Response) => {
  try {
    const basePath = req.query.path as string;
    const file = req.query.file as string;

    if (!basePath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    const fsService = new FileSystemService(basePath);
    const result = await fsService.readFile(file);
    const language = FileSystemService.getLanguageFromPath(file);

    res.json({
      content: result.content,
      size: result.size,
      binary: result.binary,
      language,
    });
  } catch (err) {
    logger.error('Failed to read file', { err });
    res.status(500).json({ error: 'Failed to read file' });
  }
});

export { router as filesRouter };
