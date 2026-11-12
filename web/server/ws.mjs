// Minimal WebSocket server (RFC 6455) so online play needs no dependencies. It handles what browsers
// send: masked text frames, fragmentation, ping/pong and close. Messages are JSON objects.
//
// It is strict about what it accepts, since anyone can connect: unmasked or oversized frames, unknown
// opcodes and messages over MAX_MESSAGE (fragments included) close the connection, and so does a client
// that stops reading while the server's writes pile up.

import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;          // the biggest real message (a hello or a deck) is under 2 KB
const MAX_BUFFERED = 4 * 1024 * 1024;   // unsent bytes before a client that isn't reading is dropped

// Call from the HTTP server's 'upgrade' event. onConnection receives a socket wrapper with
// send(obj), close(), on('message' | 'close', fn) and the client's address in `ip`.
export function acceptWebSocket(req, socket, onConnection) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
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
  let fragmentBytes = 0;
  let closed = false;
  let alive = true;

  const emit = (type, arg) => handlers[type].forEach(fn => fn(arg));
  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    buffer = Buffer.alloc(0);
    fragments = [];
    // end() lets a close frame or a last error message flush; destroy anyway if the client never reads it.
    socket.end();
    setTimeout(() => socket.destroy(), 2000).unref();
    emit('close');
  };

  const writeFrame = (opcode, payload) => {
    if (closed || socket.destroyed) return;
    if (socket.writableLength > MAX_BUFFERED) return finish();
    const len = payload.length;
    const head = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    if (len < 126) head[1] = len;
    else if (len < 65536) { head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    socket.write(Buffer.concat([head, payload]));
  };

  socket.on('data', chunk => {
    if (closed) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const fin = (buffer[0] & 0x80) !== 0;
      const rsv = buffer[0] & 0x70;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      const control = opcode >= 0x8;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      // Clients must mask, use no extensions, and keep control frames small and unfragmented.
      if (!masked || rsv || ![0x0, 0x1, 0x8, 0x9, 0xa].includes(opcode) || (control && (!fin || len > 125))) return finish();
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (len > MAX_MESSAGE || fragmentBytes + len > MAX_MESSAGE) return finish();
      const maskEnd = offset + 4;
      if (buffer.length < maskEnd + len) return;
      const payload = Buffer.from(buffer.subarray(maskEnd, maskEnd + len));
      for (let i = 0; i < len; i++) payload[i] ^= buffer[offset + (i & 3)];
      buffer = buffer.subarray(maskEnd + len);

      if (opcode === 0x8) { writeFrame(0x8, Buffer.alloc(0)); return finish(); }
      if (opcode === 0x9) { writeFrame(0xa, payload); continue; }
      if (opcode === 0xa) { alive = true; continue; }
      // A continuation needs a message to continue; a new text message can't start mid-message.
      if ((opcode === 0x0) !== (fragments.length > 0)) return finish();
      fragments.push(payload);
      fragmentBytes += len;
      if (!fin) continue;
      const text = Buffer.concat(fragments).toString('utf8');
      fragments = [];
      fragmentBytes = 0;
      let msg;
      try { msg = JSON.parse(text); } catch { continue; }
      if (msg && typeof msg === 'object' && !Array.isArray(msg)) emit('message', msg);
      if (closed) return;
    }
  });
  socket.on('close', finish);
  socket.on('error', finish);

  // Drop connections that stop answering pings (closed laptop lids, dead Wi-Fi).
  const heartbeat = setInterval(() => {
    if (!alive) return finish();
    alive = false;
    writeFrame(0x9, Buffer.alloc(0));
  }, 15000);

  return {
    ip: socket.remoteAddress ?? '',
    send: obj => writeFrame(0x1, Buffer.from(JSON.stringify(obj))),
    close: () => { writeFrame(0x8, Buffer.alloc(0)); finish(); },
    on: (type, fn) => handlers[type].push(fn),
    get open() { return !closed; },
  };
}
