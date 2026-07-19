const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const balancePath = path.join(root, 'data', 'balance.json');
const port = Number(process.env.PORT) || 3010;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(response, status, value) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  response.end(JSON.stringify(value));
}

function validBalance(data) {
  return data && typeof data === 'object' && data.version === 1 &&
    data.globals && typeof data.globals === 'object' &&
    data.buildings && typeof data.buildings === 'object';
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/api/balance' && request.method === 'GET') {
    fs.readFile(balancePath, 'utf8', (error, content) => {
      if (error) return sendJson(response, 500, {error: '无法读取数值配置'});
      response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end(content);
    });
    return;
  }
  if (url.pathname === '/api/balance' && request.method === 'POST') {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) request.destroy();
    });
    request.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!validBalance(data)) return sendJson(response, 400, {error: '数值配置结构无效'});
        fs.mkdirSync(path.dirname(balancePath), {recursive: true});
        const temporaryPath = balancePath + '.tmp';
        fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        fs.renameSync(temporaryPath, balancePath);
        sendJson(response, 200, {ok: true});
      } catch (error) {
        sendJson(response, 400, {error: error.message});
      }
    });
    return;
  }

  const requested = decodeURIComponent(url.pathname === '/' ? '/game.html' : url.pathname);
  const filePath = path.resolve(root, '.' + requested);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) return sendJson(response, 403, {error: '禁止访问'});
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(response, error.code === 'ENOENT' ? 404 : 500, {error: '文件不可用'});
    response.writeHead(200, {'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'});
    response.end(content);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Colony development server: http://127.0.0.1:${port}/game.html`);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Colony development server: http://127.0.0.1:${port}/game.html (already running)`);
    process.exit(0);
  }
  throw error;
});
