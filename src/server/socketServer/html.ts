import type { Request, Response, RequestHandler } from 'express';

const render = (title: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <link rel="icon" type="image/x-icon" href="/client/favicon.ico">
    <title>${title}</title>
    <link rel="stylesheet" href="/client/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/app.js"></script>
  </body>
</html>`;

export const html = (title: string): RequestHandler => (
  _req: Request,
  res: Response,
): void => {
  res.send(render(title));
};
