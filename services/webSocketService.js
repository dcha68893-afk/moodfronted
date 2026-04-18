import crypto from "crypto";

function toBuffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function buildFrame(payload, opcode = 0x1) {
  const body = Buffer.from(String(payload), "utf8");
  const length = body.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, length]), body]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, body]);
}

function parseFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if (offset + frameLength > buffer.length) break;

    let payloadStart = offset + headerLength;
    let payload = buffer.subarray(payloadStart + maskLength, payloadStart + maskLength + payloadLength);

    if (masked) {
      const mask = buffer.subarray(payloadStart, payloadStart + 4);
      payload = Buffer.from(payload);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    messages.push({ opcode, payload });
    offset += frameLength;
  }

  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

function normalizeMessageType(type) {
  return String(type || "").trim();
}

export class WebSocketService {
  constructor({ authenticateRequest }) {
    this.authenticateRequest = authenticateRequest;
    this.userSockets = new Map();
    this.socketUsers = new Map();
    this.messageHandler = null;
  }

  setMessageHandler(handler) {
    this.messageHandler = typeof handler === "function" ? handler : null;
  }

  isUserOnline(userId) {
    return this.userSockets.has(String(userId));
  }

  sendToUser(userId, event, payload = {}) {
    const socket = this.userSockets.get(String(userId));
    if (!socket || socket.destroyed) return false;

    this.send(socket, event, payload);
    return true;
  }

  broadcast(event, payload = {}, { exceptUserId = null } = {}) {
    for (const [userId, socket] of this.userSockets.entries()) {
      if (exceptUserId && String(exceptUserId) === String(userId)) continue;
      if (!socket.destroyed) {
        this.send(socket, event, payload);
      }
    }
  }

  registerUser(userId, socket) {
    const normalizedUserId = String(userId);
    const existingSocket = this.userSockets.get(normalizedUserId);
    if (existingSocket && existingSocket !== socket && !existingSocket.destroyed) {
      try {
        existingSocket.end(buildFrame(JSON.stringify({
          type: "session:replaced",
          payload: { userId: normalizedUserId, timestamp: Date.now() },
        }), 0x1));
      } catch {}
      existingSocket.destroy();
    }

    this.userSockets.set(normalizedUserId, socket);
    this.socketUsers.set(socket, normalizedUserId);
    console.log("[WS] User connected:", normalizedUserId);
    this.broadcast("presence:update", {
      userId: normalizedUserId,
      online: true,
      timestamp: Date.now(),
    }, { exceptUserId: normalizedUserId });
  }

  removeUser(userIdOrSocket) {
    const normalizedUserId = this.socketUsers.get(userIdOrSocket)
      || (userIdOrSocket != null ? String(userIdOrSocket) : null);

    if (!normalizedUserId) return;

    const socket = this.userSockets.get(normalizedUserId);
    if (socket) {
      this.socketUsers.delete(socket);
      this.userSockets.delete(normalizedUserId);
    }

    this.broadcast("presence:update", {
      userId: normalizedUserId,
      online: false,
      timestamp: Date.now(),
    }, { exceptUserId: normalizedUserId });
  }

  send(socket, event, payload = {}) {
    if (!socket || socket.destroyed || !socket.writable) return false;

    const message = JSON.stringify({
      type: event,
      payload,
      timestamp: Date.now(),
    });

    try {
      socket.write(buildFrame(message));
      return true;
    } catch {
      return false;
    }
  }

  sendPacket(socket, packet) {
    if (!socket || socket.destroyed || !socket.writable) return false;

    try {
      socket.write(buildFrame(JSON.stringify(packet)));
      return true;
    } catch {
      return false;
    }
  }

  handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    try {
      const key = req.headers["sec-websocket-key"];
      const upgrade = String(req.headers.upgrade || "").toLowerCase();

      if (!key || upgrade !== "websocket") {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      const authResult = this.authenticateRequest(req);
      if (!authResult?.user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const acceptKey = crypto
        .createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");

      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n"
          + "Upgrade: websocket\r\n"
          + "Connection: Upgrade\r\n"
          + `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
      );

      socket._wsBuffer = head && head.length ? toBuffer(head) : Buffer.alloc(0);
      socket._wsUser = authResult.user;

      this.registerUser(authResult.user.id, socket);
      this.send(socket, "welcome", {
        userId: authResult.user.id,
        authenticated: true,
      });
      this.send(socket, "AUTHENTICATED", {
        userId: authResult.user.id,
        authenticated: true,
      });

      socket.on("data", (chunk) => this.handleSocketData(socket, chunk));
      socket.on("close", () => this.removeUser(socket));
      socket.on("end", () => this.removeUser(socket));
      socket.on("error", () => this.removeUser(socket));

      if (socket._wsBuffer.length > 0) {
        this.handleSocketData(socket, Buffer.alloc(0));
      }
    } catch {
      socket.destroy();
    }
  }

  handleSocketData(socket, chunk) {
    socket._wsBuffer = Buffer.concat([socket._wsBuffer || Buffer.alloc(0), toBuffer(chunk)]);
    const { messages, remaining } = parseFrames(socket._wsBuffer);
    socket._wsBuffer = remaining;

    messages.forEach(({ opcode, payload }) => {
      if (opcode === 0x8) {
        socket.end(buildFrame("", 0x8));
        this.removeUser(socket);
        return;
      }

      if (opcode === 0x9) {
        socket.write(buildFrame(payload, 0xA));
        return;
      }

      if (opcode !== 0x1) return;

      const rawPayload = payload.toString("utf8");
      if (rawPayload === "ping") {
        socket.write(buildFrame("pong"));
        return;
      }

      let parsedMessage = null;
      try {
        parsedMessage = JSON.parse(rawPayload);
      } catch {
        return;
      }

      const messageType = normalizeMessageType(parsedMessage.type);
      if (!messageType) return;

      if (messageType.toLowerCase() === "ping") {
        this.send(socket, "PONG", { timestamp: Date.now() });
        return;
      }

      if (messageType === "AUTHENTICATE") {
        this.send(socket, "AUTHENTICATED", {
          userId: socket._wsUser?.id || null,
          authenticated: true,
        });
        return;
      }

      if (parsedMessage.messageId) {
        this.sendPacket(socket, {
          type: "ACK",
          messageId: parsedMessage.messageId,
          payload: {
            success: true,
            received: true,
            type: messageType,
          },
          timestamp: Date.now(),
        });
      }

      if (this.messageHandler) {
        this.messageHandler({
          socket,
          user: socket._wsUser || null,
          message: parsedMessage,
          type: messageType,
          payload: parsedMessage.payload || {},
        });
      }
    });
  }
}
