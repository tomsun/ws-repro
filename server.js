const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const crypto = require('crypto');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle non-WebSocket requests
  if (pathname === '/') {
    try {
      const htmlContent = fs.readFileSync('./index.html', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlContent);
    } catch (error) {
      res.writeHead(500);
      res.end('Error loading index.html: ' + error.message);
    }
    return;
  }

  // For all -returnshtml routes, return HTML with that status code
  if (pathname.endsWith('-returnshtml')) {
    const statusCode = parseInt(pathname.slice(1).split('-')[0]) || 200;
    const message = getStatusMessage(statusCode);
    const headers = { 'Content-Type': 'text/html' };
    if (statusCode === 401) {
      headers['WWW-Authenticate'] = 'Basic realm="Test"';
    }
    res.writeHead(statusCode, headers);
    res.end(`<h1>${statusCode} ${message}</h1><p>This endpoint does not upgrade to WebSocket.</p>`);
    return;
  }

  res.writeHead(404);
  res.end('404 Not Found');
});

// WebSocket server that handles all paths with custom status codes
const wss = new WebSocket.Server({
  noServer: true
});

server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  console.log(`WebSocket upgrade attempt to: ${pathname}`);

  let statusCode = null;

  // For all -upgrade or -upgrades routes, upgrade with that status code
  if (pathname.endsWith('-upgrade') || pathname.endsWith('-upgrades')) {
    statusCode = parseInt(pathname.slice(1).split('-')[0]) || 101;
  } else if (pathname === '/101' || pathname === '/redirected') {
    statusCode = 101;
  }

  if (statusCode !== null) {
    const message = getStatusMessage(statusCode);
    const key = request.headers['sec-websocket-key'];
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    let headers = `HTTP/1.1 ${statusCode} ${message}\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n`;

    // For 3xx, add Location header
    if (statusCode >= 300 && statusCode < 400) {
      headers += `Location: ws://${request.headers.host}/redirected\r\n`;
    }

    headers += `\r\n`;

    socket.write(headers);

    // Manually create WebSocket connection
    const ws = new WebSocket(null, null, {});
    ws.setSocket(socket, head, { maxPayload: 100 * 1024 * 1024 });
    ws.statusCode = statusCode;
    wss.emit('connection', ws, request);
  } else {
    // Unknown path - reject with 404
    socket.write(
      'HTTP/1.1 404 Not Found\r\n' +
      'Connection: close\r\n' +
      '\r\n'
    );
    socket.destroy();
  }
});

function getStatusMessage(code) {
  const messages = {
    101: 'Switching Protocols',
    200: 'OK',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    401: 'Unauthorized',
    402: 'Payment Required',
    404: 'Not Found'
  };
  return messages[code] || 'Unknown';
}

wss.on('connection', (ws, req) => {
  const pathname = req.url;
  console.log(`WebSocket connected on: ${pathname}`);

  // Send hello message immediately after connection
  ws.send(`Server: Hello! Connected to ${pathname}`);

  ws.on('message', (message) => {
    console.log(`Received: ${message}`);
    ws.send(`Echo: ${message}`);
  });

  ws.on('close', () => {
    console.log(`WebSocket closed on: ${pathname}`);
  });
});

const PORT = process.env.PORT || 2323;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
