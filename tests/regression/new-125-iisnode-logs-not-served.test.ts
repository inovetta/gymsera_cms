/**
 * NEW-125 (P1, security): the site's iisnode log files must not be readable over HTTP.
 *
 * web.config had an "iisnode logs" rewrite rule (`^iisnode(?:/.*)?$`, action None), so IIS
 * served the iisnode log folder as static files: /iisnode/index.html answered 200 on
 * cms.gymsera.com and gymsera.com (owner check, 2026-11-03), the same defect the API had
 * (be `21c13e7`). The stdout/stderr files hold stack traces and request logs. iisnode still
 * writes them on the server (loggingEnabled stays on); they are read there, not over HTTP.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const webConfig = () => read('web.config');

describe('NEW-125: the iisnode log folder is not served', () => {
  test('no rewrite rule lets /iisnode through untouched', () => {
    expect(webConfig()).not.toMatch(/<match url="\^iisnode/);
    expect(webConfig()).not.toMatch(/name="iisnode logs"/);
  });

  test('request filtering hides the iisnode segment, even if such a rule comes back', () => {
    expect(webConfig()).toMatch(
      /<hiddenSegments>[\s\S]*<add segment="iisnode" \/>[\s\S]*<\/hiddenSegments>/,
    );
  });

  test('the logs are still written on the server', () => {
    expect(webConfig()).toMatch(/<iisnode[^>]*loggingEnabled="true"/);
  });

  test('iisnode never sends developer errors (stack traces) to the browser', () => {
    expect(webConfig()).toMatch(/<iisnode[^>]*devErrorsEnabled="false"/);
  });

  test('server.js answers a failed request without the error or its stack', () => {
    const server = read('server.js');
    expect(server).toMatch(/response\.end\('Internal server error'\)/);
    // The body is a fixed string: never the error object, its message or its stack.
    expect(server).not.toMatch(/response\.(end|write)\(\s*[^'"\s)]*(error|err\b)/i);
    expect(server).not.toMatch(/\.stack\b/);
    expect(server).toMatch(/next\(\{\s*dev:\s*false\s*\}\)/);
  });

  test('the iisnode log folder is not in the repository', () => {
    expect(read('.gitignore')).toMatch(/^\/?iisnode\/$/m);
  });
});
