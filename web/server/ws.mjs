// Minimal WebSocket server (RFC 6455) so online play needs no dependencies. It handles what browsers
// send: masked text frames, fragmentation, ping/pong and close. Messages are JSON objects.

import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 256 * 1024;

// Call from the HTTP server's 'upgrade' event. onConnection receives a socket wrapper with
// send(obj), close(), and on('message' | 'close', fn).
export function acceptWebSocket(req, socket, onConnection) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`, '', '',
  ].join('\r\n'));
  socket.setNoDelay(true);
  onConnection(wrap(socket));
}

function wrap(socket) {
  const handlers = { message: [], close: [] };
  let buffer = Buffer.alloc(0);
  let fragments = [];
  let closed = false;

  const emit = (type, arg) => handlers[type].forEach(fn => fn(arg));
  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    socket.destroy();
    emit('close');
  };

  const writeFrame = (opcode, payload) => {
    if (closed || socket.destroyed) return;
    const len = payload.length;
    const head = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    if (len < 126) head[1] = len;
    else if (len < 65536) { head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    socket.write(Buffer.concat([head, payload]));
  };

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (len > MAX_MESSAGE) return finish();
      const maskEnd = offset + (masked ? 4 : 0);
      if (buffer.length < maskEnd + len) return;
      const payload = Buffer.from(buffer.subarray(maskEnd, maskEnd + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buffer[offset + (i & 3)];
      buffer = buffer.subarray(maskEnd + len);

      if (opcode === 0x8) { writeFrame(0x8, Buffer.alloc(0)); return finish(); }
      if (opcode === 0x9) { writeFrame(0xa, payload); continue; }
      if (opcode === 0xa) { alive = true; continue; }
      if (opcode === 0x1 || opcode === 0x0) {
        fragments.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(fragments).toString('utf8');
        fragments = [];
        let msg;
        try { msg = JSON.parse(text); } catch { continue; }
        if (msg && typeof msg === 'object') emit('message', msg);
      }
    }
  });
  socket.on('close', finish);
  socket.on('error', finish);

  // Drop connections that stop answering pings (closed laptop lids, dead Wi-Fi).
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) return finish();
    alive = false;
    writeFrame(0x9, Buffer.alloc(0));
  }, 15000);

  return {
    send: obj => writeFrame(0x1, Buffer.from(JSON.stringify(obj))),
    close: () => { writeFrame(0x8, Buffer.alloc(0)); finish(); },
    on: (type, fn) => handlers[type].push(fn),
    get open() { return !closed; },
  };
}
