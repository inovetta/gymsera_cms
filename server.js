'use strict';

const http = require('http');
const next = require('next');

const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const handleUpgrade = app.getUpgradeHandler();
    const server = http.createServer((request, response) => {
      handle(request, response).catch((error) => {
        console.error('Next.js request failed:', error);
        if (!response.headersSent) response.statusCode = 500;
        response.end('Internal server error');
      });
    });

    server.on('upgrade', (request, socket, head) => {
      handleUpgrade(request, socket, head);
    });

    server.listen(port, () => {
      console.log(`Shah Alam Dairies frontend is listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error('Unable to start the Next.js application:', error);
    process.exit(1);
  });
