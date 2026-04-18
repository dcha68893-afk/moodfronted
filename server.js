/**
 * UniConnectSphere Server
 */

import express from "express";
import http from "http";
import path from "path";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import { createAuthMiddleware, extractBearerToken, verifyJwtToken } from "./middleware/auth.js";
import { WebSocketService } from "./services/webSocketService.js";
import { createCallService } from "./services/callService.js";
import { createCallController } from "./controllers/callController.js";
import { createCallRouter } from "./routes/calls.js";

// 🔥 FIXED: Use the correct import pattern for Cloudinary v1
import cloudinary from "cloudinary";

// Load environment variables
import "dotenv/config";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

function sendSuccess(res, data, status = 200, message = "OK") {
  return res.status(status).json({ success: true, data, message });
}

function sendError(res, message, status = 500, extra = {}) {
  return res.status(status).json({ success: false, data: null, message, ...extra });
}

function normalizeApiBody(body, fallbackMessage = "OK") {
  const normalized = body && typeof body === "object" ? { ...body } : {};
  const success = normalized.success !== false;
  const message = normalized.message || normalized.error || (success ? fallbackMessage : "Request failed");
  const data = Object.prototype.hasOwnProperty.call(normalized, "data")
    ? normalized.data
    : null;

  return {
    ...normalized,
    success,
    data,
    message,
  };
}

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CLOUDINARY CONFIG ---
// Configure Cloudinary (v1 API)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== "your_actual_cloud_name";

console.log(
  isCloudinaryConfigured
    ? "✅ Cloudinary configured successfully"
    : "⚠️ Cloudinary NOT fully configured"
);

// --- RATE LIMITING ---
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// --- MIDDLEWARE ---
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/api", (req, _res, next) => {
  console.log("[API] Request:", req.url);
  next();
});

// Serve static files
app.use(express.static(__dirname));

// --- CLOUDINARY SIGNATURE ---
function generateSignature(params) {
  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { ...params, timestamp },
    cloudinary.config().api_secret
  );

  return { signature, timestamp };
}

// --- SIGNED UPLOAD ---
app.post("/api/cloudinary/sign-upload", uploadLimiter, (req, res) => {
  try {
    const { filename, fileType, fileSize } = req.body;

    if (!filename || !fileType) {
      return sendError(res, "Missing filename or type", 400);
    }

    const maxSize = 10 * 1024 * 1024;
    if (fileSize > maxSize) {
      return sendError(res, "Max file size is 10MB", 400);
    }

    let resourceType = "auto";
    if (fileType.startsWith("image/")) resourceType = "image";
    else if (fileType.startsWith("video/")) resourceType = "video";
    else if (fileType.startsWith("audio/")) resourceType = "video";
    else resourceType = "raw";

    const publicId = `uniconnect/${Date.now()}_${crypto
      .randomBytes(8)
      .toString("hex")}`;

    const uploadParams = {
      public_id: publicId,
      resource_type: resourceType,
      folder: "uniconnect",
    };

    const { signature, timestamp } = generateSignature(uploadParams);

    sendSuccess(res, {
      params: {
        ...uploadParams,
        signature,
        timestamp,
        api_key: cloudinary.config().api_key,
      },
      uploadUrl: `https://api.cloudinary.com/v1_1/${
        cloudinary.config().cloud_name
      }/${resourceType}/upload`,
    });
  } catch (err) {
    console.error("❌ Signing error:", err);
    sendError(res, "Server error", 500);
  }
});

// --- DIRECT UPLOAD USING MULTER ---
// 🔥 FIXED: Use memory storage instead of CloudinaryStorage to avoid dependency issues
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post(
  "/api/cloudinary/direct-upload",
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendError(res, "No file uploaded", 400);
      }

      // Upload buffer directly to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "uniconnect/direct",
            resource_type: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        
        uploadStream.end(req.file.buffer);
      });

      sendSuccess(res, {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
        cloudinary: {
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
        },
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      sendError(res, "Upload failed", 500);
    }
  }
);

// --- DELETE CLOUDINARY FILE ---
app.delete("/api/cloudinary/delete-asset", apiLimiter, async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return sendError(res, "publicId required", 400);
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
    });

    sendSuccess(res, { result });
  } catch (err) {
    console.error("❌ Delete error:", err);
    sendError(res, "Server error", 500);
  }
});

// --- BASIC PAGES ---
const pages = [
  "index",
  "legal",
  "platform",
  "support",
  "login",
  "register",
  "dashboard",
  "profile",
  "upload",
  "marketplace",
  "chat",
  "games",
  "payment",
  "notifications",
  "settings",
  "forgot-password",
];

pages.forEach((page) => {
  app.get(`/${page === "index" ? "" : page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  sendSuccess(res, {
    status: "OK",
    timestamp: new Date().toISOString(),
    cloudinary: isCloudinaryConfigured ? "Configured" : "Not Configured",
  }, 200, "Service healthy");
});

const DEV_AUTH_SECRET = process.env.JWT_SECRET || process.env.DEV_AUTH_SECRET || "knecta-dev-secret";
const devState = {
  users: new Map(),
  settings: new Map(),
  friends: new Map(),
  friendRequestsIncoming: new Map(),
  friendRequestsSent: new Map(),
  groups: new Map(),
  groupInvites: new Map(),
  statuses: new Map(),
  chats: new Map(),
  calls: new Map(),
  callRecords: new Map(),
  idempotencyKeys: new Map(),
  marketplace: [],
  purchases: [],
  payments: [],
};

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signDevToken(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", DEV_AUTH_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyDevToken(token) {
  try {
    const [header, body, signature] = String(token || "").split(".");
    if (!header || !body || !signature) return null;
    const expected = crypto
      .createHmac("sha256", DEV_AUTH_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (expected !== signature) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function ensureUserBucket(map, userId, factory) {
  if (!map.has(userId)) map.set(userId, factory());
  return map.get(userId);
}

function normalizeEntityId(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function buildDirectChatId(userA, userB) {
  return [String(userA), String(userB)].sort().join("__");
}

function ensureChatRecord(userId, chatId, participantIds = []) {
  const chats = ensureUserBucket(devState.chats, String(userId), () => []);
  let chat = chats.find((item) => String(item.id) === String(chatId));
  if (!chat) {
    chat = {
      id: String(chatId),
      participantIds: participantIds.map((id) => String(id)),
      messages: [],
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    };
    chats.push(chat);
  }
  if (participantIds.length > 0) {
    chat.participantIds = Array.from(new Set([...(chat.participantIds || []).map(String), ...participantIds.map(String)]));
  }
  return chat;
}

function resolveChatContext(userId, body = {}) {
  const senderId = String(userId);
  const receiverId = normalizeEntityId(body.receiverId || body.userId || body.toUserId);
  const requestedChatId = normalizeEntityId(body.chatId);
  const chatId = receiverId
    ? buildDirectChatId(senderId, receiverId)
    : (requestedChatId || buildDirectChatId(senderId, senderId));
  const participantIds = Array.from(new Set([senderId, ...(receiverId ? [receiverId] : [])]));
  return { chatId, senderId, receiverId, participantIds };
}

function inferReceiverIdFromChat(userId, chat) {
  const me = String(userId);
  const others = Array.isArray(chat?.participantIds) ? chat.participantIds.map(String).filter((id) => id !== me) : [];
  return others[0] || null;
}

function cloneMessage(message) {
  return JSON.parse(JSON.stringify(message));
}

function getUserById(userId) {
  return userId ? devState.users.get(String(userId)) || null : null;
}

function resolveRequestUser(req) {
  const token = extractBearerToken(req);
  if (!token) return null;

  const verification = verifyJwtToken(token, DEV_AUTH_SECRET);
  if (!verification.valid) return null;

  const payload = verification.payload || {};
  const userId = payload.userId || payload.id || payload.sub || null;
  return getUserById(userId);
}

function defaultSettings(userId) {
  return {
    userId,
    theme: "light",
    language: "en",
    notifications: { messages: true, calls: true, groups: true },
    privacy: { lastSeen: "everyone", readReceipts: true, statusVisibility: "everyone" },
    chat: { autoDownloadMedia: true, fontSize: "medium" },
    syncEnabled: false,
    updatedAt: new Date().toISOString(),
  };
}

function ensureMarketplaceSeed() {
  if (devState.marketplace.length > 0) return devState.marketplace;
  devState.marketplace = [
    {
      id: "listing_seed_1",
      title: "Wireless Headset",
      description: "Demo marketplace listing",
      price: 1250,
      currency: "KES",
      sellerId: "seed_seller",
      createdAt: new Date().toISOString(),
      savedBy: [],
      views: 0,
      spotlight: true,
    }
  ];
  return devState.marketplace;
}

function ensureSeedUser(userId, overrides = {}) {
  const normalizedUserId = String(userId);
  const existingUser = devState.users.get(normalizedUserId) || {
    id: normalizedUserId,
    username: normalizedUserId,
    displayName: overrides.displayName || `User ${normalizedUserId}`,
    email: overrides.email || `${normalizedUserId}@local.dev`,
  };

  const userRecord = { ...existingUser, ...overrides, id: normalizedUserId };
  devState.users.set(normalizedUserId, userRecord);
  ensureUserBucket(devState.settings, normalizedUserId, () => defaultSettings(normalizedUserId));
  ensureUserBucket(devState.friends, normalizedUserId, () => []);
  ensureUserBucket(devState.friendRequestsIncoming, normalizedUserId, () => []);
  ensureUserBucket(devState.friendRequestsSent, normalizedUserId, () => []);
  ensureUserBucket(devState.groups, normalizedUserId, () => []);
  ensureUserBucket(devState.groupInvites, normalizedUserId, () => []);
  ensureUserBucket(devState.statuses, normalizedUserId, () => []);
  ensureUserBucket(devState.chats, normalizedUserId, () => []);
  ensureUserBucket(devState.calls, normalizedUserId, () => []);
  return userRecord;
}

[
  { id: "101", username: "alex", displayName: "Alex Morgan", email: "alex@local.dev" },
  { id: "102", username: "sam", displayName: "Sam Taylor", email: "sam@local.dev" },
  { id: "103", username: "jamie", displayName: "Jamie Lee", email: "jamie@local.dev" },
].forEach((user) => ensureSeedUser(user.id, user));

const authMiddleware = createAuthMiddleware({
  secret: DEV_AUTH_SECRET,
  getUserById,
});

const webSocketService = new WebSocketService({
  authenticateRequest(req) {
    const token = extractBearerToken({
      headers: req.headers,
      query: Object.fromEntries(new URL(req.url, "http://localhost").searchParams.entries()),
    });

    if (!token) return { user: null };

    const verification = verifyJwtToken(token, DEV_AUTH_SECRET);
    if (!verification.valid) return { user: null };

    const payload = verification.payload || {};
    const userId = payload.userId || payload.id || payload.sub || null;
    const user = getUserById(userId);

    return { token, payload, user };
  },
});

const callService = createCallService({
  state: devState,
  webSocketService,
});

const callController = createCallController(callService);

webSocketService.setMessageHandler(({ user, type, payload }) => {
  const normalizedType = String(type || "").toLowerCase();
  if (!user?.id) return;

  if (normalizedType === "message:new" || normalizedType === "message:send" || normalizedType === "message") {
    const receiverId = payload.receiverId || payload.userId || payload.toUserId || null;
    if (receiverId) {
      webSocketService.sendToUser(receiverId, "message:new", {
        ...payload,
        senderId: user.id,
        createdAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (normalizedType === "message:delivered" || normalizedType === "message:read") {
    const targetUserId = payload.senderId || payload.receiverId || payload.userId || null;
    if (targetUserId) {
      webSocketService.sendToUser(targetUserId, normalizedType, {
        ...payload,
        userId: user.id,
      });
    }
    return;
  }

  if (normalizedType === "webrtc:signal") {
    const targetUserId = payload.targetUserId || payload.receiverId || payload.userId || null;
    if (targetUserId) {
      webSocketService.sendToUser(targetUserId, "webrtc:signal", {
        ...payload,
        fromUserId: user.id,
      });
    }
    return;
  }

  if (normalizedType === "call:accept" || normalizedType === "call_accept" || type === "CALL_ACCEPT") {
    if (payload.callId) callService.answerCall(payload.callId, user);
    return;
  }

  if (normalizedType === "call:reject" || normalizedType === "call_reject" || type === "CALL_REJECT") {
    if (payload.callId) callService.rejectCall(payload.callId, user, payload.reason || "rejected");
    return;
  }

  if (normalizedType === "call:cancelled" || normalizedType === "call_cancelled" || type === "CALL_CANCELLED") {
    if (payload.callId) callService.cancelCall(payload.callId, user);
  }
});

function apiDataForPath(req, user) {
  const { path: routePath, method } = req;
  const userId = user?.id || "guest";

  if (routePath === "/auth" || routePath === "/auth/login") {
    const identifier = req.body?.email || req.body?.username || req.body?.identifier;
    const password = req.body?.password;
    if (!identifier || !password) {
      return { status: 400, body: { success: false, error: "Missing credentials" } };
    }

    const safeId = String(identifier).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_") || `user_${Date.now()}`;
    const userRecord = devState.users.get(safeId) || {
      id: safeId,
      username: safeId,
      displayName: req.body?.displayName || safeId,
      email: req.body?.email || `${safeId}@local.dev`,
    };
    devState.users.set(safeId, userRecord);
    ensureUserBucket(devState.settings, safeId, () => defaultSettings(safeId));
    ensureUserBucket(devState.friends, safeId, () => []);
    ensureUserBucket(devState.groups, safeId, () => []);
    ensureUserBucket(devState.statuses, safeId, () => []);
    ensureUserBucket(devState.chats, safeId, () => []);

    const token = signDevToken({
      userId: safeId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    });

    return {
      body: {
        success: true,
        data: { token, refreshToken: null, user: userRecord },
        token,
        user: userRecord,
      },
    };
  }

  if (routePath === "/auth/me" || routePath === "/auth/verify") {
    if (!user) {
      return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    }
    return { body: { success: true, data: user, user } };
  }

  if (routePath === "/auth/refresh") {
    if (!user) {
      return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    }
    const token = signDevToken({
      userId: user.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    });
    return { body: { success: true, data: { token, user }, token, user } };
  }

  if (routePath === "/auth/logout") {
    return { body: { success: true, data: { loggedOut: true } } };
  }

  if (routePath.startsWith("/settings")) {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const current = ensureUserBucket(devState.settings, user.id, () => defaultSettings(user.id));
    if (method === "GET") {
      return { body: { success: true, data: { settings: current } } };
    }
    const next = {
      ...current,
      ...(req.body || {}),
      updatedAt: new Date().toISOString(),
    };
    devState.settings.set(user.id, next);
    return { body: { success: true, data: { settings: next } } };
  }

  if (routePath === "/friends" || routePath.startsWith("/friends/")) {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const friends = ensureUserBucket(devState.friends, user.id, () => []);
    return {
      body: {
        success: true,
        data: {
          friends,
          incoming: [],
          sent: [],
          pinned: [],
          muted: [],
          blocked: [],
          contacts: friends,
          users: [],
          groups: ensureUserBucket(devState.groups, user.id, () => []),
        },
      },
    };
  }

  if (routePath === "/groups" || routePath.startsWith("/groups/")) {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const groups = ensureUserBucket(devState.groups, user.id, () => []);
    if (method === "POST" && req.body) {
      const created = {
        id: `group_${Date.now()}`,
        name: req.body.name || "Untitled Group",
        description: req.body.description || "",
        privacy: req.body.privacy || "private",
        topic: req.body.topic || "",
        memberIds: Array.isArray(req.body.memberIds) ? req.body.memberIds : (Array.isArray(req.body.members) ? req.body.members : []),
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      groups.unshift(created);
      return { body: { success: true, data: created, group: created } };
    }
    if (routePath !== "/groups") {
      const groupId = routePath.split("/")[2];
      const group = groups.find((item) => String(item.id) === String(groupId));
      return { body: { success: true, data: group || null, group: group || null } };
    }
    return { body: { success: true, data: { groups }, groups } };
  }

  if (routePath === "/status" || routePath.startsWith("/status/")) {
    if (!user && routePath !== "/status") {
      return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    }
    const statuses = ensureUserBucket(devState.statuses, userId, () => []);
    if (method === "POST" && req.body) {
      const created = {
        id: `status_${Date.now()}`,
        userId,
        ...req.body,
        createdAt: new Date().toISOString(),
      };
      statuses.unshift(created);
      return { body: { success: true, data: { status: created, statuses, my: statuses, friends: statuses, highlights: [] }, status: created } };
    }
    if (routePath === "/status/my") {
      return { body: { success: true, data: { statuses }, statuses } };
    }
    if (routePath === "/status/friends") {
      return { body: { success: true, data: { statuses }, statuses } };
    }
    if (routePath === "/status/highlights") {
      return { body: { success: true, data: { highlights: [] }, highlights: [] } };
    }
    return { body: { success: true, data: { statuses, my: statuses, friends: statuses, highlights: [] }, statuses } };
  }

  if (routePath === "/messages" || routePath.startsWith("/messages") || routePath.startsWith("/chats") || routePath.startsWith("/conversations")) {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const chatId = req.query.chatId || req.body?.chatId || req.params?.chatId || "default";
    const chats = ensureUserBucket(devState.chats, user.id, () => []);
    const existing = chats.find((chat) => chat.id === chatId) || { id: chatId, messages: [] };
    if (!chats.find((chat) => chat.id === chatId)) chats.push(existing);
    if (method === "POST" && req.body?.content) {
      existing.messages.push({
        id: `msg_${Date.now()}`,
        chatId,
        senderId: user.id,
        content: req.body.content,
        type: req.body.type || "text",
        createdAt: new Date().toISOString(),
      });
    }
    return { body: { success: true, data: { chats, messages: existing.messages, unread: 0 } } };
  }

  if (routePath === "/calls" || routePath.startsWith("/calls/")) {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const calls = ensureUserBucket(devState.calls, user.id, () => []);
    if (routePath === "/calls/history") {
      return { body: { success: true, data: { calls } } };
    }
    const endMatch = routePath.match(/^\/calls\/([^/]+)\/end$/);
    if (endMatch && method === "POST") {
      const callId = endMatch[1];
      const existing = calls.find((call) => String(call.id) === String(callId));
      const endedCall = {
        ...(existing || { id: callId, initiatorId: user.id, participantIds: [], createdAt: new Date().toISOString() }),
        status: req.body?.status || "ended",
        duration: req.body?.duration || 0,
        endedBy: req.body?.endedBy || user.id,
        endedAt: new Date().toISOString(),
      };
      if (existing) {
        Object.assign(existing, endedCall);
      } else {
        calls.unshift(endedCall);
      }
      return { body: { success: true, data: { call: endedCall, calls } } };
    }
    if (method === "POST") {
      const participantIds = Array.isArray(req.body?.participantIds)
        ? req.body.participantIds.map((id) => String(id))
        : [];
      const callType = req.body?.callType || req.body?.type || "audio";
      const createdCall = {
        id: `call_${Date.now()}`,
        callType,
        status: "initiated",
        initiatorId: user.id,
        participantIds,
        createdAt: new Date().toISOString(),
        receiverOnline: participantIds.some((id) => webSocketService.isUserOnline(id)),
      };
      calls.unshift(createdCall);
      return {
        body: {
          success: true,
          data: {
            call: createdCall,
            callId: createdCall.id,
            receiverOnline: createdCall.receiverOnline,
            calls,
          },
        },
      };
    }
    return { body: { success: true, data: { calls } } };
  }

  if (routePath === "/payments/process" && method === "POST") {
    const payment = {
      id: `payment_${Date.now()}`,
      userId: user?.id || req.body?.buyerId || "guest",
      amount: req.body?.amount || 0,
      currency: req.body?.currency || "KES",
      paymentMethod: req.body?.paymentMethod || "card",
      phone: req.body?.phone || req.body?.mpesaPhone || null,
      status: "completed",
      createdAt: new Date().toISOString(),
    };
    devState.payments.unshift(payment);
    return { body: { success: true, data: payment, payment } };
  }

  if (routePath.startsWith("/marketplace")) {
    const listings = ensureMarketplaceSeed();
    const listingIdMatch = routePath.match(/^\/marketplace\/listings\/([^/]+)(?:\/([^/]+))?$/);

    if (routePath === "/marketplace/listings" && method === "GET") {
      const page = Math.max(1, Number(req.query?.page || 1));
      const limit = Math.max(1, Number(req.query?.limit || 20));
      const start = (page - 1) * limit;
      const paged = listings.slice(start, start + limit);
      return { body: { success: true, data: { listings: paged, total: listings.length, page, limit } } };
    }

    if (routePath === "/marketplace/listings/saved") {
      const saved = listings.filter((listing) => listing.savedBy.includes(user?.id));
      return { body: { success: true, data: { listings: saved, total: saved.length } } };
    }

    if (routePath === "/marketplace/spotlight") {
      return { body: { success: true, data: { listings: listings.filter((listing) => listing.spotlight), total: listings.length } } };
    }

    if (routePath === "/marketplace/listings" && method === "POST") {
      const created = {
        id: `listing_${Date.now()}`,
        title: req.body?.title || "Untitled Listing",
        description: req.body?.description || "",
        price: req.body?.price || 0,
        currency: req.body?.currency || "KES",
        sellerId: user?.id || req.body?.sellerId || "guest",
        createdAt: new Date().toISOString(),
        savedBy: [],
        views: 0,
        spotlight: false,
      };
      listings.unshift(created);
      return { body: { success: true, data: created, listing: created } };
    }

    if (routePath === "/marketplace/listings/bulk" && method === "POST") {
      const items = Array.isArray(req.body) ? req.body : [req.body];
      const created = items.filter(Boolean).map((item) => ({
        id: `listing_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: item?.title || "Untitled Listing",
        description: item?.description || "",
        price: item?.price || 0,
        currency: item?.currency || "KES",
        sellerId: user?.id || item?.sellerId || "guest",
        createdAt: new Date().toISOString(),
        savedBy: [],
        views: 0,
        spotlight: false,
      }));
      listings.unshift(...created);
      return { body: { success: true, data: { listings: created, total: created.length } } };
    }

    if (routePath === "/marketplace/listings/premium" && method === "POST") {
      const created = {
        id: `listing_${Date.now()}`,
        title: req.body?.title || "Premium Listing",
        description: req.body?.description || "",
        price: req.body?.price || 0,
        currency: req.body?.currency || "KES",
        sellerId: user?.id || req.body?.sellerId || "guest",
        createdAt: new Date().toISOString(),
        savedBy: [],
        views: 0,
        spotlight: true,
        premium: true,
      };
      listings.unshift(created);
      return { body: { success: true, data: created, listing: created } };
    }

    if (routePath === "/marketplace/spotlight" && method === "POST") {
      const target = listings.find((listing) => String(listing.id) === String(req.body?.listingId));
      if (!target) return { status: 404, body: { success: false, error: "Listing not found", data: null } };
      target.spotlight = true;
      return { body: { success: true, data: target, listing: target } };
    }

    if (routePath === "/marketplace/boost" && method === "POST") {
      const target = listings.find((listing) => String(listing.id) === String(req.body?.listingId));
      if (!target) return { status: 404, body: { success: false, error: "Listing not found", data: null } };
      target.boostedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      return { body: { success: true, data: target, listing: target } };
    }

    if (routePath === "/marketplace/tips" && method === "POST") {
      return {
        body: {
          success: true,
          data: {
            id: `tip_${Date.now()}`,
            listingId: req.body?.listingId || null,
            amount: req.body?.amount || 0,
            senderId: user?.id || "guest",
            createdAt: new Date().toISOString(),
          }
        }
      };
    }

    if (listingIdMatch) {
      const listingId = listingIdMatch[1];
      const action = listingIdMatch[2] || null;
      const listing = listings.find((item) => String(item.id) === String(listingId));
      if (!listing) return { status: 404, body: { success: false, error: "Listing not found", data: null } };

      if (!action && method === "PUT") {
        Object.assign(listing, req.body || {}, { updatedAt: new Date().toISOString() });
        return { body: { success: true, data: listing, listing } };
      }

      if (!action && method === "DELETE") {
        devState.marketplace = listings.filter((item) => String(item.id) !== String(listingId));
        return { body: { success: true, data: { deleted: true, id: listingId } } };
      }

      if (action === "save" && method === "POST") {
        const saverId = user?.id || "guest";
        const isSaved = listing.savedBy.includes(saverId);
        listing.savedBy = isSaved
          ? listing.savedBy.filter((id) => id !== saverId)
          : [...listing.savedBy, saverId];
        return { body: { success: true, data: { saved: !isSaved, listing } } };
      }

      if (action === "view" && method === "POST") {
        listing.views += 1;
        return { body: { success: true, data: { views: listing.views, listing } } };
      }

      if (action === "purchase" && method === "POST") {
        const purchase = {
          id: `purchase_${Date.now()}`,
          listingId,
          buyerId: user?.id || req.body?.buyerId || "guest",
          createdAt: new Date().toISOString(),
        };
        devState.purchases.unshift(purchase);
        return { body: { success: true, data: purchase, purchase } };
      }
    }
  }

  if (routePath === "/offline/process") {
    return { body: { success: true, data: { processed: true, item: req.body || null } } };
  }

  if (routePath === "/profile" || routePath.startsWith("/users/") || routePath.startsWith("/storage/") || routePath.startsWith("/marketplace") || routePath.startsWith("/payments") || routePath.startsWith("/premium")) {
    return { body: { success: true, data: Array.isArray(req.body) ? req.body : safeObjectForApi(req.body) } };
  }

  return { body: { success: true, data: [] } };
}

function safeObjectForApi(value) {
  return value && typeof value === "object" ? value : {};
}

app.post(["/api/auth", "/api/auth/login"], apiLimiter, (req, res) => {
  const identifier = req.body?.email || req.body?.username || req.body?.identifier;
  const password = req.body?.password;

  if (!identifier || !password) {
    return sendError(res, "Missing credentials", 400);
  }

  const safeId = String(identifier).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_") || `user_${Date.now()}`;
  const userRecord = ensureSeedUser(safeId, {
    username: safeId,
    displayName: req.body?.displayName || safeId,
    email: req.body?.email || `${safeId}@local.dev`,
  });

  const token = signDevToken({
    userId: safeId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });

  return res.status(200).json({
    success: true,
    data: {
      token,
      refreshToken: null,
      user: userRecord,
      userId: userRecord.id,
      authenticated: true,
    },
    message: "Login successful",
  });
});

app.get("/api/auth/me", apiLimiter, authMiddleware, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user,
      userId: req.user.id,
      authenticated: true,
    },
    message: "Authenticated user loaded",
  });
});

app.get("/api/auth/verify", apiLimiter, authMiddleware, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      valid: true,
      authenticated: true,
      user: req.user,
    },
    message: "Token valid",
  });
});

app.post("/api/auth/refresh", apiLimiter, authMiddleware, (req, res) => {
  const token = signDevToken({
    userId: req.user.id,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });

  return res.status(200).json({
    success: true,
    data: {
      token,
      user: req.user,
      authenticated: true,
    },
    message: "Token refreshed",
  });
});

app.post("/api/auth/logout", apiLimiter, authMiddleware, (_req, res) => {
  return res.status(200).json({
    success: true,
    data: { loggedOut: true },
    message: "Logged out",
  });
});

app.get("/api/status/my", apiLimiter, authMiddleware, (req, res) => {
  const statuses = ensureUserBucket(devState.statuses, req.user.id, () => []);
  return res.status(200).json({
    success: true,
    data: {
      statuses,
      my: statuses,
    },
    message: "My statuses loaded",
  });
});

app.get("/api/status/highlights", apiLimiter, authMiddleware, (req, res) => {
  const highlights = Array.from(devState.statuses.values())
    .flat()
    .filter((status) => String(status.userId) !== String(req.user.id))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20);

  return res.status(200).json({
    success: true,
    data: { highlights },
    message: "Status highlights loaded",
  });
});

app.post("/api/status", apiLimiter, authMiddleware, (req, res) => {
  const statuses = ensureUserBucket(devState.statuses, req.user.id, () => []);
  const clientRequestId = req.body?.clientRequestId || req.body?.requestId || null;
  const dedupeKey = clientRequestId ? `status:${req.user.id}:${clientRequestId}` : null;

  if (dedupeKey && devState.idempotencyKeys.has(dedupeKey)) {
    const existingStatusId = devState.idempotencyKeys.get(dedupeKey);
    const existingStatus = statuses.find((status) => String(status.id) === String(existingStatusId)) || null;
    if (existingStatus) {
      return res.status(200).json({
        success: true,
        data: { status: existingStatus, reused: true },
        message: "Status request reused",
      });
    }
  }

  const createdStatus = {
    id: req.body?.id || `status_${Date.now()}`,
    userId: req.user.id,
    text: req.body?.text || req.body?.content || "",
    mediaUrl: req.body?.mediaUrl || null,
    visibility: req.body?.visibility || "friends",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  statuses.unshift(createdStatus);
  if (dedupeKey) devState.idempotencyKeys.set(dedupeKey, createdStatus.id);

  return res.status(201).json({
    success: true,
    data: {
      status: createdStatus,
      statuses,
    },
    message: "Status created",
  });
});

app.get("/api/friends/users/all", apiLimiter, authMiddleware, (req, res) => {
  const currentFriends = ensureUserBucket(devState.friends, req.user.id, () => []);
  const limit = Math.max(1, Number(req.query.limit || 200));

  const users = Array.from(devState.users.values())
    .filter((user) => String(user.id) !== String(req.user.id))
    .slice(0, limit)
    .map((user) => ({
      ...user,
      online: webSocketService.isUserOnline(user.id),
      isFriend: currentFriends.some((friend) => String(friend.id || friend.userId || friend) === String(user.id)),
    }));

  return res.status(200).json({
    success: true,
    data: {
      users,
      total: users.length,
    },
    message: "Users loaded",
  });
});

app.get("/api/friends/incoming", apiLimiter, authMiddleware, (req, res) => {
  const incoming = ensureUserBucket(devState.friendRequestsIncoming, req.user.id, () => []);
  return res.status(200).json({
    success: true,
    data: {
      incoming,
      total: incoming.length,
    },
    message: "Incoming friend requests loaded",
  });
});

app.get("/api/groups/invites/user", apiLimiter, authMiddleware, (req, res) => {
  const invites = ensureUserBucket(devState.groupInvites, req.user.id, () => []);
  return res.status(200).json({
    success: true,
    data: {
      invites,
      total: invites.length,
    },
    message: "Group invites loaded",
  });
});

app.use("/api/calls", apiLimiter, createCallRouter({
  authMiddleware,
  controller: callController,
}));

app.get("/api/messages", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chatId = normalizeEntityId(req.query.chatId);
  if (!chatId) {
    return sendError(res, "chatId is required", 400);
  }

  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const chat = chats.find((item) => String(item.id) === chatId) || ensureChatRecord(userId, chatId, [userId]);
  const before = req.query.before ? Date.parse(req.query.before) : null;
  const after = req.query.after ? Date.parse(req.query.after) : null;
  const limit = Math.max(1, Number(req.query.limit || 100));

  let messages = Array.isArray(chat.messages) ? [...chat.messages] : [];
  if (Number.isFinite(before)) {
    messages = messages.filter((message) => Date.parse(message.createdAt) < before);
  }
  if (Number.isFinite(after)) {
    messages = messages.filter((message) => Date.parse(message.createdAt) > after);
  }
  messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  messages = messages.slice(-limit);

  return sendSuccess(res, {
    chatId,
    messages,
    unread: chat.unreadCount || 0,
  }, 200, "Messages loaded");
});

app.post("/api/messages", apiLimiter, authMiddleware, (req, res) => {
  const { chatId, senderId, receiverId, participantIds } = resolveChatContext(req.user.id, req.body || {});
  const content = String(req.body?.content || "").trim();
  const type = req.body?.type || "text";
  const localId = normalizeEntityId(req.body?.localId);

  if (!content && !req.body?.attachment) {
    return sendError(res, "Message content is required", 400);
  }

  const createdAt = new Date().toISOString();
  const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const delivered = receiverId ? webSocketService.isUserOnline(receiverId) : false;
  const message = {
    id: messageId,
    localId,
    chatId,
    conversationId: chatId,
    senderId,
    receiverId,
    content,
    type,
    attachment: req.body?.attachment || null,
    replyToId: req.body?.replyToId || null,
    mentions: Array.isArray(req.body?.mentions) ? req.body.mentions : [],
    createdAt,
    updatedAt: createdAt,
    status: delivered ? "delivered" : "sent",
  };

  participantIds.forEach((participantId) => {
    const chat = ensureChatRecord(participantId, chatId, participantIds);
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    chat.messages.push(cloneMessage(message));
    chat.lastMessage = content;
    chat.lastMessageAt = createdAt;
    chat.updatedAt = createdAt;
    if (String(participantId) !== senderId) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
  });

  if (receiverId) {
    webSocketService.sendToUser(receiverId, "new_message", message);
  }

  webSocketService.sendToUser(senderId, "message_sent", {
    messageId,
    localId,
    serverId: messageId,
    chatId,
    createdAt,
  });

  if (delivered) {
    webSocketService.sendToUser(senderId, "message_delivered", {
      messageId,
      localId,
      serverId: messageId,
      chatId,
      deliveredAt: createdAt,
    });
  }

  return sendSuccess(res, {
    message,
    chatId,
    delivered,
  }, 201, "Message created");
});

app.post("/api/messages/mark-read/batch", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chatId = normalizeEntityId(req.body?.chatId);
  const incomingIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds.map(String) : [];
  if (!chatId || incomingIds.length === 0) {
    return sendError(res, "chatId and messageIds are required", 400);
  }

  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const chat = chats.find((item) => String(item.id) === chatId);
  if (!chat) {
    return sendSuccess(res, { chatId, messageIds: [], updated: 0 }, 200, "Nothing to mark as read");
  }

  const readAt = new Date().toISOString();
  const updatedMessages = [];
  chat.messages = (chat.messages || []).map((message) => {
    if (!incomingIds.includes(String(message.id))) return message;
    const next = { ...message, status: "read", readAt, updatedAt: readAt };
    updatedMessages.push(next);
    return next;
  });
  chat.unreadCount = 0;
  chat.updatedAt = readAt;

  const participantIds = Array.isArray(chat.participantIds) ? chat.participantIds.map(String) : [userId];
  participantIds
    .filter((participantId) => participantId !== userId)
    .forEach((participantId) => {
      const participantChat = ensureChatRecord(participantId, chatId, participantIds);
      participantChat.messages = (participantChat.messages || []).map((message) => {
        if (!incomingIds.includes(String(message.id))) return message;
        return { ...message, status: "read", readAt, updatedAt: readAt };
      });
      participantChat.updatedAt = readAt;
    });

  const senderIds = new Set();
  updatedMessages.forEach((message) => {
    if (message.senderId && String(message.senderId) !== userId) {
      senderIds.add(String(message.senderId));
    }
  });

  senderIds.forEach((senderId) => {
    updatedMessages.forEach((message) => {
      if (String(message.senderId) === senderId) {
        webSocketService.sendToUser(senderId, "message_read", {
          messageId: message.id,
          localId: message.localId || null,
          serverId: message.id,
          chatId,
          readAt,
          readerId: userId,
        });
      }
    });
  });

  return sendSuccess(res, {
    chatId,
    messageIds: updatedMessages.map((message) => message.id),
    updated: updatedMessages.length,
    readAt,
  }, 200, "Messages marked as read");
});

app.use("/api", apiLimiter, (req, res, next) => {
  if (
    req.path.startsWith("/cloudinary") ||
    req.path === "/health"
  ) {
    return next();
  }

  const user = resolveRequestUser(req);
  const { status = 200, body } = apiDataForPath(req, user);
  return res.status(status).json(normalizeApiBody(body));
});

// DEFAULT 404 HANDLERS
app.use("/api/*", (req, res) =>
  sendError(res, "API not found", 404)
);

app.use((req, res) => {
  if (req.accepts("html")) res.sendFile(path.join(__dirname, "index.html"));
  else sendError(res, "Not found", 404);
});

// START SERVER
server.on("upgrade", (req, socket, head) => {
  if (String(req.url || "").startsWith("/ws")) {
    webSocketService.handleUpgrade(req, socket, head);
    return;
  }

  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
