import serve from 'serve-static';
import { assetsPath } from './shared/path.js';

export const serveStatic = (path: string) => serve(assetsPath(path));
