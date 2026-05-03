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
  friendRequestRecords: new Map(),
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

function uniqueById(items = [], idSelector = (item) => item?.id) {
  const seen = new Set();
  return items.filter((item) => {
    const id = idSelector(item);
    if (id === undefined || id === null || id === "") return false;
    const key = String(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeEntityId(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function normalizeApiRoutePath(routePath) {
  const normalized = String(routePath || "");
  if (normalized.startsWith("/tools/marketplace")) {
    return normalized.replace("/tools/marketplace", "/marketplace");
  }
  if (normalized.startsWith("/tools/premium")) {
    return normalized.replace("/tools/premium", "/premium");
  }
  if (normalized.startsWith("/tools/user")) {
    return normalized.replace("/tools/user", "/user");
  }
  return normalized;
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
  const requestedChatId = normalizeEntityId(body.chatId || body.conversationId);
  let receiverId = normalizeEntityId(body.receiverId || body.userId || body.toUserId);
  let participantIds = [];

  if (requestedChatId && requestedChatId.includes("__")) {
    const idsFromChatId = requestedChatId
      .split("__")
      .map((id) => String(id).trim())
      .filter(Boolean);
    if (idsFromChatId.includes(senderId)) {
      participantIds = idsFromChatId;
      receiverId = receiverId || idsFromChatId.find((id) => id !== senderId) || null;
    }
  }

  if (requestedChatId && !receiverId) {
    const existingChat = ensureUserBucket(devState.chats, senderId, () => [])
      .find((chat) => String(chat.id) === String(requestedChatId));
    if (existingChat?.participantIds?.length) {
      participantIds = existingChat.participantIds.map(String);
      receiverId = participantIds.find((id) => id !== senderId) || null;
    }
  }

  if (receiverId) {
    participantIds = Array.from(new Set([senderId, receiverId]));
  } else if (participantIds.length === 0) {
    participantIds = [senderId];
  } else if (!participantIds.includes(senderId)) {
    participantIds = Array.from(new Set([senderId, ...participantIds]));
  }

  const chatId = requestedChatId || (receiverId
    ? buildDirectChatId(senderId, receiverId)
    : buildDirectChatId(senderId, senderId));
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

function getAcceptedFriends(userId) {
  return uniqueById(
    ensureUserBucket(devState.friends, String(userId), () => []),
    (friend) => friend?.id || friend?.userId
  );
}

function getAcceptedFriendIds(userId) {
  return getAcceptedFriends(userId).map((friend) => String(friend.id || friend.userId));
}

function getUserProfile(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  return {
    ...user,
    status: webSocketService?.isUserOnline?.(user.id) ? "online" : "offline",
    online: webSocketService?.isUserOnline?.(user.id) || false,
    isOnline: webSocketService?.isUserOnline?.(user.id) || false,
    lastSeen: webSocketService?.isUserOnline?.(user.id) ? null : new Date().toISOString(),
  };
}

function getFriendSummary(userId, friendId) {
  const profile = getUserProfile(friendId) || ensureSeedUser(friendId);
  return {
    id: String(friendId),
    userId: String(friendId),
    displayName: profile.displayName || profile.username || `User ${friendId}`,
    username: profile.username || String(friendId),
    avatar: profile.avatar || null,
    photoURL: profile.avatar || null,
    status: profile.online ? "online" : "offline",
    online: !!profile.online,
    isOnline: !!profile.isOnline,
    addedAt: new Date().toISOString(),
  };
}

function syncFriendRelationship(userA, userB) {
  const normalizedA = String(userA);
  const normalizedB = String(userB);
  if (normalizedA === normalizedB) return;

  const friendsA = ensureUserBucket(devState.friends, normalizedA, () => []);
  const friendsB = ensureUserBucket(devState.friends, normalizedB, () => []);

  if (!friendsA.some((friend) => String(friend.id || friend.userId) === normalizedB)) {
    friendsA.unshift(getFriendSummary(normalizedA, normalizedB));
  }
  if (!friendsB.some((friend) => String(friend.id || friend.userId) === normalizedA)) {
    friendsB.unshift(getFriendSummary(normalizedB, normalizedA));
  }
}

function removeFriendRelationship(userA, userB) {
  const normalizedA = String(userA);
  const normalizedB = String(userB);
  devState.friends.set(
    normalizedA,
    ensureUserBucket(devState.friends, normalizedA, () => [])
      .filter((friend) => String(friend.id || friend.userId) !== normalizedB)
  );
  devState.friends.set(
    normalizedB,
    ensureUserBucket(devState.friends, normalizedB, () => [])
      .filter((friend) => String(friend.id || friend.userId) !== normalizedA)
  );
}

function buildFriendRequestRecord({ senderId, receiverId, note = "", category = "friend" }) {
  const sender = ensureSeedUser(senderId);
  const receiver = ensureSeedUser(receiverId);
  const now = new Date().toISOString();

  return {
    id: `friend_req_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    senderId: String(sender.id),
    receiverId: String(receiver.id),
    requesterId: String(sender.id),
    status: "pending",
    category,
    note,
    createdAt: now,
    updatedAt: now,
    senderName: sender.displayName || sender.username,
    senderUsername: sender.username || sender.id,
    senderAvatar: sender.avatar || null,
    receiverName: receiver.displayName || receiver.username,
    receiverUsername: receiver.username || receiver.id,
    receiverAvatar: receiver.avatar || null,
    user: {
      id: String(sender.id),
      displayName: sender.displayName || sender.username,
      username: sender.username || sender.id,
      avatar: sender.avatar || null,
    },
  };
}

function storeFriendRequestRecord(record) {
  devState.friendRequestRecords.set(String(record.id), record);
  const incoming = ensureUserBucket(devState.friendRequestsIncoming, String(record.receiverId), () => []);
  const sent = ensureUserBucket(devState.friendRequestsSent, String(record.senderId), () => []);
  incoming.unshift(record);
  sent.unshift(record);
  return record;
}

function removeFriendRequestRecord(recordId) {
  const record = devState.friendRequestRecords.get(String(recordId));
  if (!record) return null;
  devState.friendRequestRecords.delete(String(recordId));
  devState.friendRequestsIncoming.set(
    String(record.receiverId),
    ensureUserBucket(devState.friendRequestsIncoming, String(record.receiverId), () => [])
      .filter((item) => String(item.id) !== String(recordId))
  );
  devState.friendRequestsSent.set(
    String(record.senderId),
    ensureUserBucket(devState.friendRequestsSent, String(record.senderId), () => [])
      .filter((item) => String(item.id) !== String(recordId))
  );
  return record;
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

  const resolveCallTargetUserId = () => {
    const directTarget = payload.targetUserId || payload.receiverId || payload.userId || payload.toUserId || null;
    if (directTarget) return String(directTarget);
    if (!payload.callId) return null;
    const call = callService.getCall(payload.callId);
    if (!call) return null;
    if (String(call.callerId) === String(user.id)) {
      return call.participantIds?.map(String).find(Boolean) || null;
    }
    return String(call.callerId);
  };

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

  if (
    normalizedType === "webrtc:signal" ||
    normalizedType === "call_offer" ||
    normalizedType === "call_answer" ||
    normalizedType === "ice_candidate" ||
    normalizedType === "signal_offer" ||
    normalizedType === "signal_answer"
  ) {
    const targetUserId = resolveCallTargetUserId();
    if (targetUserId) {
      const signalType = normalizedType === "call_offer" || normalizedType === "signal_offer"
        ? "offer"
        : normalizedType === "call_answer" || normalizedType === "signal_answer"
          ? "answer"
          : normalizedType === "ice_candidate"
            ? "ice_candidate"
            : (payload.signalType || null);
      const relayPayload = {
        ...payload,
        fromUserId: user.id,
        targetUserId,
        signalType,
      };
      if (normalizedType !== "webrtc:signal") {
        webSocketService.sendToUser(targetUserId, normalizedType, relayPayload);
      }
      webSocketService.sendToUser(targetUserId, "webrtc:signal", relayPayload);
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
    return;
  }

  if (normalizedType === "call:add_participant" || normalizedType === "call_add_participant") {
    if (payload.callId && payload.targetUserId) {
      callService.addParticipant(payload.callId, user, payload.targetUserId, payload);
    }
    return;
  }
});

function apiDataForPath(req, user) {
  const method = req.method;
  const routePath = normalizeApiRoutePath(req.path);
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
    const friends = getAcceptedFriends(user.id);
    const incoming = ensureUserBucket(devState.friendRequestsIncoming, user.id, () => []);
    const sent = ensureUserBucket(devState.friendRequestsSent, user.id, () => []);
    return {
      body: {
        success: true,
        data: {
          friends,
          incoming,
          sent,
          pinned: [],
          muted: [],
          blocked: [],
          contacts: friends,
          users: Array.from(devState.users.values())
            .filter((candidate) => String(candidate.id) !== String(user.id))
            .map((candidate) => ({
              ...candidate,
              online: webSocketService.isUserOnline(candidate.id),
              isOnline: webSocketService.isUserOnline(candidate.id),
              status: webSocketService.isUserOnline(candidate.id) ? "online" : "offline",
            })),
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
    const friendStatuses = getAcceptedFriendIds(userId)
      .flatMap((friendId) => ensureUserBucket(devState.statuses, friendId, () => []))
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
    if (method === "POST" && req.body) {
      const created = {
        id: `status_${Date.now()}`,
        userId,
        ...req.body,
        createdAt: new Date().toISOString(),
      };
      statuses.unshift(created);
      return { body: { success: true, data: { status: created, statuses, my: statuses, friends: friendStatuses, highlights: friendStatuses.slice(0, 20) }, status: created } };
    }
    if (routePath === "/status/my") {
      return { body: { success: true, data: { statuses }, statuses } };
    }
    if (routePath === "/status/friends") {
      return { body: { success: true, data: { statuses: friendStatuses }, statuses: friendStatuses } };
    }
    if (routePath === "/status/highlights") {
      return { body: { success: true, data: { highlights: friendStatuses.slice(0, 20) }, highlights: friendStatuses.slice(0, 20) } };
    }
    return { body: { success: true, data: { statuses, my: statuses, friends: friendStatuses, highlights: friendStatuses.slice(0, 20) }, statuses } };
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

    if (routePath === "/marketplace/orders/mine" && method === "GET") {
      const buyerId = String(user?.id || "guest");
      const orders = devState.purchases
        .filter((purchase) => String(purchase.buyerId) === buyerId)
        .map((purchase) => ({
          ...purchase,
          status: purchase.status || "paid",
        }));
      return { body: { success: true, data: { orders, total: orders.length } } };
    }

    if (routePath === "/marketplace/orders" && method === "POST") {
      const order = {
        id: `order_${Date.now()}`,
        buyerId: String(user?.id || req.body?.buyerId || "guest"),
        listingId: req.body?.listingId || null,
        productId: req.body?.productId || req.body?.listingId || null,
        status: "paid",
        createdAt: new Date().toISOString(),
      };
      devState.purchases.unshift(order);
      return { body: { success: true, data: { order } } };
    }

    const cancelOrderMatch = routePath.match(/^\/marketplace\/orders\/([^/]+)\/cancel$/);
    if (cancelOrderMatch && method === "POST") {
      const orderId = cancelOrderMatch[1];
      const order = devState.purchases.find((purchase) => String(purchase.id) === String(orderId));
      if (!order) return { status: 404, body: { success: false, error: "Order not found", data: null } };
      order.status = "cancelled";
      order.cancelReason = req.body?.reason || "Cancelled by user";
      order.updatedAt = new Date().toISOString();
      return { body: { success: true, data: { order } } };
    }

    const reviewListMatch = routePath.match(/^\/marketplace\/listings\/([^/]+)\/reviews$/);
    if (reviewListMatch && method === "GET") {
      return { body: { success: true, data: { reviews: [], total: 0 } } };
    }

    if (reviewListMatch && method === "POST") {
      const review = {
        id: `review_${Date.now()}`,
        listingId: reviewListMatch[1],
        reviewerId: String(user?.id || "guest"),
        rating: Number(req.body?.rating || 5),
        comment: req.body?.comment || "",
        createdAt: new Date().toISOString(),
      };
      return { body: { success: true, data: { review } } };
    }

    const helpfulMatch = routePath.match(/^\/marketplace\/reviews\/([^/]+)\/helpful$/);
    if (helpfulMatch && method === "POST") {
      return { body: { success: true, data: { reviewId: helpfulMatch[1], helpful: true } } };
    }

    const sellerMatch = routePath.match(/^\/marketplace\/seller\/([^/]+)$/);
    if (sellerMatch && method === "GET") {
      const sellerId = sellerMatch[1];
      const sellerListings = listings.filter((listing) => String(listing.sellerId) === String(sellerId));
      return {
        body: {
          success: true,
          data: {
            seller: getUserProfile(sellerId) || ensureSeedUser(sellerId),
            listings: sellerListings,
            total: sellerListings.length,
          },
        },
      };
    }

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

  if (routePath === "/premium/features") {
    return {
      body: {
        success: true,
        data: {
          features: {
            premiumListings: true,
            boostedListings: true,
            analytics: true,
            teamWorkspaces: true,
          },
        },
      },
    };
  }

  if (routePath === "/user/subscription") {
    return {
      body: {
        success: true,
        data: {
          subscription: {
            id: "plan_free",
            plan: "free",
            active: false,
            features: [],
          },
        },
      },
    };
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

  const recipients = new Set([String(req.user.id), ...getAcceptedFriendIds(req.user.id)]);
  recipients.forEach((targetUserId) => {
    webSocketService.sendToUser(targetUserId, "status:created", {
      status: createdStatus,
      statusId: createdStatus.id,
      userId: req.user.id,
      timestamp: Date.now(),
    });
  });

  return res.status(201).json({
    success: true,
    data: {
      status: createdStatus,
      statuses,
    },
    message: "Status created",
  });
});

app.get("/api/status/friends", apiLimiter, authMiddleware, (req, res) => {
  const statuses = getAcceptedFriendIds(req.user.id)
    .flatMap((friendId) => ensureUserBucket(devState.statuses, friendId, () => []))
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));

  return res.status(200).json({
    success: true,
    data: { statuses },
    message: "Friends statuses loaded",
  });
});

app.post("/api/status/:statusId/view", apiLimiter, authMiddleware, (req, res) => {
  const statusId = String(req.params.statusId);
  const statusOwnerId = Array.from(devState.statuses.entries())
    .find(([, entries]) => entries.some((status) => String(status.id) === statusId))?.[0];
  if (!statusOwnerId) {
    return sendError(res, "Status not found", 404);
  }

  const statuses = ensureUserBucket(devState.statuses, statusOwnerId, () => []);
  const status = statuses.find((entry) => String(entry.id) === statusId);
  if (!status) {
    return sendError(res, "Status not found", 404);
  }

  status.viewers = Array.isArray(status.viewers) ? status.viewers : [];
  if (!status.viewers.includes(String(req.user.id))) {
    status.viewers.push(String(req.user.id));
  }
  status.viewCount = status.viewers.length;
  status.updatedAt = new Date().toISOString();

  const payload = {
    statusId,
    userId: statusOwnerId,
    viewerId: req.user.id,
    viewerCount: status.viewCount,
    timestamp: Date.now(),
  };
  webSocketService.sendToUser(statusOwnerId, "status:viewed", payload);
  webSocketService.sendToUser(statusOwnerId, "status:viewer_update", payload);
  webSocketService.sendToUser(req.user.id, "status:viewer_update", payload);

  return sendSuccess(res, {
    statusId,
    viewCount: status.viewCount,
    viewed: true,
  }, 200, "Status view tracked");
});

app.post("/api/status/:statusId/reply", apiLimiter, authMiddleware, (req, res) => {
  const statusId = String(req.params.statusId);
  const replyText = String(req.body?.reply || req.body?.text || req.body?.message || "").trim();
  if (!replyText) {
    return sendError(res, "Reply is required", 400);
  }

  const statusOwnerId = Array.from(devState.statuses.entries())
    .find(([, entries]) => entries.some((status) => String(status.id) === statusId))?.[0];
  if (!statusOwnerId) {
    return sendError(res, "Status not found", 404);
  }

  const statuses = ensureUserBucket(devState.statuses, statusOwnerId, () => []);
  const status = statuses.find((entry) => String(entry.id) === statusId);
  if (!status) {
    return sendError(res, "Status not found", 404);
  }

  status.replies = Array.isArray(status.replies) ? status.replies : [];
  const reply = {
    id: `status_reply_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    statusId,
    senderId: req.user.id,
    receiverId: statusOwnerId,
    text: replyText,
    createdAt: new Date().toISOString(),
  };
  status.replies.push(reply);
  status.replyCount = status.replies.length;
  status.updatedAt = reply.createdAt;

  const payload = {
    statusId,
    reply,
    userId: statusOwnerId,
    senderId: req.user.id,
    timestamp: Date.now(),
  };
  webSocketService.sendToUser(statusOwnerId, "status:reply", payload);
  webSocketService.sendToUser(req.user.id, "status:reply", payload);

  return sendSuccess(res, {
    reply,
    statusId,
    replyCount: status.replyCount,
  }, 201, "Status reply sent");
});

app.post("/api/status/:statusId/like", apiLimiter, authMiddleware, (req, res) => {
  const statusId = String(req.params.statusId);
  const reaction = String(req.body?.reaction || "like");
  const statusOwnerId = Array.from(devState.statuses.entries())
    .find(([, entries]) => entries.some((status) => String(status.id) === statusId))?.[0];
  if (!statusOwnerId) {
    return sendError(res, "Status not found", 404);
  }

  const statuses = ensureUserBucket(devState.statuses, statusOwnerId, () => []);
  const status = statuses.find((entry) => String(entry.id) === statusId);
  if (!status) {
    return sendError(res, "Status not found", 404);
  }

  status.reactions = status.reactions && typeof status.reactions === "object" ? status.reactions : {};
  status.reactions[reaction] = Array.isArray(status.reactions[reaction]) ? status.reactions[reaction] : [];
  if (!status.reactions[reaction].includes(String(req.user.id))) {
    status.reactions[reaction].push(String(req.user.id));
  }
  status.likeCount = Object.values(status.reactions).reduce((total, users) => total + users.length, 0);
  status.updatedAt = new Date().toISOString();

  const payload = {
    statusId,
    reaction,
    userId: req.user.id,
    ownerId: statusOwnerId,
    count: status.reactions[reaction].length,
    totalCount: status.likeCount,
    timestamp: Date.now(),
  };
  [statusOwnerId, req.user.id, ...getAcceptedFriendIds(statusOwnerId)].forEach((targetUserId) => {
    webSocketService.sendToUser(targetUserId, "status:reaction", payload);
  });

  return sendSuccess(res, {
    statusId,
    reaction,
    count: status.reactions[reaction].length,
    totalCount: status.likeCount,
  }, 200, "Reaction added");
});

app.delete("/api/status/:statusId/like", apiLimiter, authMiddleware, (req, res) => {
  const statusId = String(req.params.statusId);
  const reaction = String(req.body?.reaction || req.query?.reaction || "like");
  const statusOwnerId = Array.from(devState.statuses.entries())
    .find(([, entries]) => entries.some((status) => String(status.id) === statusId))?.[0];
  if (!statusOwnerId) {
    return sendError(res, "Status not found", 404);
  }

  const statuses = ensureUserBucket(devState.statuses, statusOwnerId, () => []);
  const status = statuses.find((entry) => String(entry.id) === statusId);
  if (!status) {
    return sendError(res, "Status not found", 404);
  }

  status.reactions = status.reactions && typeof status.reactions === "object" ? status.reactions : {};
  status.reactions[reaction] = (status.reactions[reaction] || []).filter((userId) => String(userId) !== String(req.user.id));
  if (status.reactions[reaction].length === 0) {
    delete status.reactions[reaction];
  }
  status.likeCount = Object.values(status.reactions).reduce((total, users) => total + users.length, 0);
  status.updatedAt = new Date().toISOString();

  return sendSuccess(res, {
    statusId,
    reaction,
    totalCount: status.likeCount,
  }, 200, "Reaction removed");
});

app.delete("/api/status/:statusId", apiLimiter, authMiddleware, (req, res) => {
  const statusId = String(req.params.statusId);
  const statuses = ensureUserBucket(devState.statuses, req.user.id, () => []);
  const existing = statuses.find((status) => String(status.id) === statusId);
  if (!existing) {
    return sendError(res, "Status not found", 404);
  }

  devState.statuses.set(
    String(req.user.id),
    statuses.filter((status) => String(status.id) !== statusId)
  );

  [String(req.user.id), ...getAcceptedFriendIds(req.user.id)].forEach((targetUserId) => {
    webSocketService.sendToUser(targetUserId, "status:deleted", {
      statusId,
      userId: req.user.id,
      timestamp: Date.now(),
    });
  });

  return sendSuccess(res, {
    deleted: true,
    statusId,
  }, 200, "Status deleted");
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

app.get("/api/friends/sent", apiLimiter, authMiddleware, (req, res) => {
  const sent = ensureUserBucket(devState.friendRequestsSent, req.user.id, () => []);
  return res.status(200).json({
    success: true,
    data: {
      sent,
      total: sent.length,
    },
    message: "Sent friend requests loaded",
  });
});

app.get("/api/friends/user/:userId", apiLimiter, authMiddleware, (req, res) => {
  const user = getUserProfile(req.params.userId);
  if (!user) {
    return sendError(res, "User not found", 404);
  }
  return sendSuccess(res, { user }, 200, "Friend profile loaded");
});

app.get("/api/friends/mutual/:userId", apiLimiter, authMiddleware, (req, res) => {
  const mine = new Set(getAcceptedFriendIds(req.user.id));
  const theirs = new Set(getAcceptedFriendIds(req.params.userId));
  const mutual = Array.from(mine)
    .filter((friendId) => theirs.has(friendId))
    .map((friendId) => getFriendSummary(req.user.id, friendId));
  return sendSuccess(res, { users: mutual, total: mutual.length }, 200, "Mutual friends loaded");
});

app.post("/api/friends/requests/send", apiLimiter, authMiddleware, (req, res) => {
  const senderId = String(req.user.id);
  const receiverId = normalizeEntityId(req.body?.receiverId || req.body?.userId);
  if (!receiverId || receiverId === senderId) {
    return sendError(res, "Valid receiverId is required", 400);
  }

  const existing = ensureUserBucket(devState.friendRequestsSent, senderId, () => [])
    .find((request) => String(request.receiverId) === receiverId && String(request.status) === "pending");
  if (existing) {
    return sendSuccess(res, { request: existing, reused: true }, 200, "Friend request reused");
  }

  const record = buildFriendRequestRecord({
    senderId,
    receiverId,
    note: req.body?.note || "",
    category: req.body?.category || "friend",
  });
  storeFriendRequestRecord(record);

  webSocketService.sendToUser(receiverId, "friend:request", record);
  webSocketService.sendToUser(senderId, "friend:request", record);

  return sendSuccess(res, { request: record }, 201, "Friend request sent");
});

app.post("/api/friends/requests/:requestId/accept", apiLimiter, authMiddleware, (req, res) => {
  const requestRecord = devState.friendRequestRecords.get(String(req.params.requestId));
  if (!requestRecord) {
    return sendError(res, "Friend request not found", 404);
  }
  if (String(requestRecord.receiverId) !== String(req.user.id)) {
    return sendError(res, "You cannot accept this friend request", 403);
  }

  removeFriendRequestRecord(requestRecord.id);
  syncFriendRelationship(requestRecord.senderId, requestRecord.receiverId);

  const acceptedBy = getFriendSummary(requestRecord.senderId, requestRecord.receiverId);
  const requesterSummary = getFriendSummary(requestRecord.receiverId, requestRecord.senderId);

  const payloadForSender = {
    requestId: requestRecord.id,
    friendId: requestRecord.receiverId,
    user: acceptedBy,
    friend: acceptedBy,
    acceptedById: requestRecord.receiverId,
    timestamp: Date.now(),
  };
  const payloadForReceiver = {
    requestId: requestRecord.id,
    friendId: requestRecord.senderId,
    user: requesterSummary,
    friend: requesterSummary,
    acceptedById: requestRecord.receiverId,
    timestamp: Date.now(),
  };

  webSocketService.sendToUser(requestRecord.senderId, "friend:accepted", payloadForSender);
  webSocketService.sendToUser(requestRecord.receiverId, "friend:accepted", payloadForReceiver);

  return sendSuccess(res, {
    friendRequest: requestRecord,
    friend: requesterSummary,
  }, 200, "Friend request accepted");
});

app.post("/api/friends/requests/:requestId/reject", apiLimiter, authMiddleware, (req, res) => {
  const requestRecord = devState.friendRequestRecords.get(String(req.params.requestId));
  if (!requestRecord) {
    return sendError(res, "Friend request not found", 404);
  }
  if (String(requestRecord.receiverId) !== String(req.user.id)) {
    return sendError(res, "You cannot reject this friend request", 403);
  }

  removeFriendRequestRecord(requestRecord.id);
  const payload = {
    requestId: requestRecord.id,
    senderId: requestRecord.senderId,
    receiverId: requestRecord.receiverId,
    timestamp: Date.now(),
  };
  webSocketService.sendToUser(requestRecord.senderId, "friend:rejected", payload);
  webSocketService.sendToUser(requestRecord.receiverId, "friend:rejected", payload);

  return sendSuccess(res, { requestId: requestRecord.id, rejected: true }, 200, "Friend request rejected");
});

app.delete("/api/friends/requests/:requestId", apiLimiter, authMiddleware, (req, res) => {
  const requestRecord = devState.friendRequestRecords.get(String(req.params.requestId));
  if (!requestRecord) {
    return sendError(res, "Friend request not found", 404);
  }
  if (![String(requestRecord.senderId), String(requestRecord.receiverId)].includes(String(req.user.id))) {
    return sendError(res, "You cannot cancel this friend request", 403);
  }

  removeFriendRequestRecord(requestRecord.id);
  const payload = {
    requestId: requestRecord.id,
    senderId: requestRecord.senderId,
    receiverId: requestRecord.receiverId,
    timestamp: Date.now(),
  };
  webSocketService.sendToUser(requestRecord.senderId, "friend:rejected", payload);
  webSocketService.sendToUser(requestRecord.receiverId, "friend:rejected", payload);

  return sendSuccess(res, { requestId: requestRecord.id, deleted: true }, 200, "Friend request cancelled");
});

app.delete("/api/friends/:friendId", apiLimiter, authMiddleware, (req, res) => {
  const friendId = String(req.params.friendId);
  removeFriendRelationship(req.user.id, friendId);
  const payload = {
    userId: req.user.id,
    friendId,
    timestamp: Date.now(),
  };
  webSocketService.sendToUser(req.user.id, "friend:removed", payload);
  webSocketService.sendToUser(friendId, "friend:removed", payload);
  return sendSuccess(res, { deleted: true, friendId }, 200, "Friend removed");
});

app.post("/api/friends/:friendId/block", apiLimiter, authMiddleware, (req, res) => {
  const friendId = String(req.params.friendId);
  removeFriendRelationship(req.user.id, friendId);
  const payload = {
    userId: req.user.id,
    friendId,
    blocked: true,
    timestamp: Date.now(),
  };
  webSocketService.sendToUser(req.user.id, "friend:blocked", payload);
  webSocketService.sendToUser(friendId, "friend:blocked", payload);
  return sendSuccess(res, { blocked: true, friendId }, 200, "User blocked");
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
  const recipientIds = participantIds.filter((participantId) => String(participantId) !== senderId);
  const delivered = recipientIds.length > 0
    ? recipientIds.every((participantId) => webSocketService.isUserOnline(participantId))
    : false;
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

  recipientIds.forEach((participantId) => {
    webSocketService.sendToUser(participantId, "new_message", message);
    webSocketService.sendToUser(participantId, "message:new", message);
  });

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
