import helmet from 'helmet';
import type { Request, Response } from 'express';

export const policies =
  () =>
  (req: Request, res: Response, next: (err?: unknown) => void): void => {
    helmet({
      referrerPolicy: { policy: ['no-referrer-when-downgrade'] },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: [
            "'self'",
            (req.protocol === 'http' ? 'ws://' : 'wss://') + req.get('host'),
          ],
        },
      },
      frameguard: { action: 'sameorigin' },
    })(req, res, next);
  };
