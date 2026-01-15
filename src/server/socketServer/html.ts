import type { Request, Response, RequestHandler } from 'express';

const render = (
  title: string,
  base: string,
): string => {
  // Use root-level paths if accessing from root routes
  const clientPath = base === '/vibehub' ? base : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <link rel="icon" type="image/x-icon" href="${clientPath}/client/favicon.ico">
    <title>${title}</title>
    <link rel="stylesheet" href="${clientPath}/client/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${clientPath}/client/app.js"></script>
  </body>
</html>`;
};

export const html = (base: string, title: string): RequestHandler => (
  _req: Request,
  res: Response,
): void => {
  res.send(
    render(
      title,
      base,
    ),
  );
};
