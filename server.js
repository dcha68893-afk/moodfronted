/**
 * UniConnectSphere Server
 */

import express from "express";
import fs from "fs";
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
const DEV_STATE_DIR = path.join(__dirname, "data");
const DEV_STATE_FILE = path.join(DEV_STATE_DIR, "dev-state.json");
const DEV_UPLOADS_DIR = path.join(DEV_STATE_DIR, "uploads");

function ensureDevStateDir() {
  try {
    fs.mkdirSync(DEV_STATE_DIR, { recursive: true });
    fs.mkdirSync(DEV_UPLOADS_DIR, { recursive: true });
  } catch (error) {
    console.warn("[DEV-STATE] Failed to ensure data directory:", error.message);
  }
}

function serializeMap(map) {
  return Array.from((map instanceof Map ? map : new Map()).entries());
}

function hydrateMap(entries, fallbackFactory = () => new Map()) {
  const map = fallbackFactory();
  if (!Array.isArray(entries)) return map;
  entries.forEach(([key, value]) => {
    map.set(String(key), value);
  });
  return map;
}

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
  messageBatches: [],
  marketplace: [],
  purchases: [],
  payments: [],
};

let devStatePersistTimer = null;

function snapshotDevState() {
  return {
    users: serializeMap(devState.users),
    settings: serializeMap(devState.settings),
    userSettings: serializeMap(devState.settings),
    friends: serializeMap(devState.friends),
    friendRequestsIncoming: serializeMap(devState.friendRequestsIncoming),
    friendRequestsSent: serializeMap(devState.friendRequestsSent),
    friendRequestRecords: serializeMap(devState.friendRequestRecords),
    groups: serializeMap(devState.groups),
    groupInvites: serializeMap(devState.groupInvites),
    statuses: serializeMap(devState.statuses),
    chats: serializeMap(devState.chats),
    calls: serializeMap(devState.calls),
    callRecords: serializeMap(devState.callRecords),
    idempotencyKeys: serializeMap(devState.idempotencyKeys),
    messageBatches: Array.isArray(devState.messageBatches) ? devState.messageBatches : [],
    marketplace: Array.isArray(devState.marketplace) ? devState.marketplace : [],
    purchases: Array.isArray(devState.purchases) ? devState.purchases : [],
    payments: Array.isArray(devState.payments) ? devState.payments : [],
  };
}

function persistDevStateNow() {
  ensureDevStateDir();
  try {
    fs.writeFileSync(DEV_STATE_FILE, JSON.stringify(snapshotDevState(), null, 2), "utf8");
  } catch (error) {
    console.warn("[DEV-STATE] Failed to persist:", error.message);
  }
}

function scheduleDevStatePersist() {
  clearTimeout(devStatePersistTimer);
  persistDevStateNow();
}

function hydrateDevState() {
  ensureDevStateDir();
  if (!fs.existsSync(DEV_STATE_FILE)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(DEV_STATE_FILE, "utf8"));
    devState.users = hydrateMap(parsed.users);
    devState.settings = hydrateMap(parsed.userSettings || parsed.settings);
    devState.friends = hydrateMap(parsed.friends);
    devState.friendRequestsIncoming = hydrateMap(parsed.friendRequestsIncoming);
    devState.friendRequestsSent = hydrateMap(parsed.friendRequestsSent);
    devState.friendRequestRecords = hydrateMap(parsed.friendRequestRecords);
    devState.groups = hydrateMap(parsed.groups);
    devState.groupInvites = hydrateMap(parsed.groupInvites);
    devState.statuses = hydrateMap(parsed.statuses);
    devState.chats = hydrateMap(parsed.chats);
    devState.calls = hydrateMap(parsed.calls);
    devState.callRecords = hydrateMap(parsed.callRecords);
    devState.idempotencyKeys = hydrateMap(parsed.idempotencyKeys);
    devState.messageBatches = Array.isArray(parsed.messageBatches) ? parsed.messageBatches : [];
    devState.marketplace = Array.isArray(parsed.marketplace) ? parsed.marketplace : [];
    devState.purchases = Array.isArray(parsed.purchases) ? parsed.purchases : [];
    devState.payments = Array.isArray(parsed.payments) ? parsed.payments : [];
  } catch (error) {
    console.warn("[DEV-STATE] Failed to hydrate:", error.message);
  }
}

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

function getParticipantIdsForChat(chatId, fallback = []) {
  for (const chats of devState.chats.values()) {
    const chat = Array.isArray(chats)
      ? chats.find((item) => String(item.id) === String(chatId))
      : null;
    if (chat?.participantIds?.length) {
      return Array.from(new Set(chat.participantIds.map(String)));
    }
  }
  return Array.from(new Set((fallback || []).map(String).filter(Boolean)));
}

function isMessageHiddenForUser(message, userId) {
  if (!message) return true;
  if (message.deletedForEveryone === true) return true;
  const deletedFor = Array.isArray(message.deletedFor) ? message.deletedFor.map(String) : [];
  return deletedFor.includes(String(userId));
}

function getVisibleChatMessages(chat, userId) {
  return (Array.isArray(chat?.messages) ? chat.messages : []).filter((message) => !isMessageHiddenForUser(message, userId));
}

function syncChatMessage(chatId, participantIds, updater) {
  Array.from(new Set((participantIds || []).map(String).filter(Boolean))).forEach((participantId) => {
    const chat = ensureChatRecord(participantId, chatId, participantIds);
    chat.messages = (chat.messages || []).map((message) => {
      if (!message) return message;
      return updater(cloneMessage(message), participantId) || message;
    });
    const visible = getVisibleChatMessages(chat, participantId);
    const lastVisible = visible[visible.length - 1] || null;
    chat.lastMessage = lastVisible?.content || "";
    chat.lastMessageAt = lastVisible?.createdAt || chat.lastMessageAt || new Date().toISOString();
    chat.updatedAt = new Date().toISOString();
  });
}

function buildChatSummaryForUser(userId, chat) {
  const participants = Array.isArray(chat?.participantIds)
    ? chat.participantIds.map(String).filter((id) => id !== String(userId))
    : [];
  const visibleMessages = getVisibleChatMessages(chat, userId);
  const lastMessage = visibleMessages[visibleMessages.length - 1] || null;
  const unreadCount = visibleMessages.filter((message) => {
    const seenBy = Array.isArray(message.seenBy) ? message.seenBy.map(String) : [];
    return String(message.senderId) !== String(userId) && !seenBy.includes(String(userId));
  }).length;
  const participantProfiles = participants.map((participantId) => getUserProfile(participantId) || ensureSeedUser(participantId));
  const primary = participantProfiles[0] || null;

  return {
    id: String(chat.id),
    chatId: String(chat.id),
    type: chat.type || (participants.length > 1 ? "group" : "direct"),
    chatType: chat.type || (participants.length > 1 ? "group" : "direct"),
    name: chat.name || primary?.displayName || primary?.username || "Chat",
    chatName: chat.name || primary?.displayName || primary?.username || "Chat",
    friendId: primary?.id ? String(primary.id) : null,
    friendName: primary?.displayName || primary?.username || "Chat",
    friendAvatar: primary?.avatar || null,
    participants: participantProfiles.map((profile) => ({
      id: String(profile.id),
      username: profile.username || String(profile.id),
      displayName: profile.displayName || profile.username || String(profile.id),
      avatar: profile.avatar || null,
      online: !!profile.online,
      status: profile.online ? "online" : "offline",
    })),
    lastMessage,
    lastMessageContent: lastMessage?.content || "",
    lastMessageAt: lastMessage?.createdAt || chat.updatedAt || new Date().toISOString(),
    unreadCount,
    updatedAt: chat.updatedAt || lastMessage?.createdAt || new Date().toISOString(),
    createdAt: chat.createdAt || chat.updatedAt || new Date().toISOString(),
    replyVisibility: chat.replyVisibility || "public",
  };
}

function emitMessageToParticipants(participantIds, message, { includeSender = false } = {}) {
  const normalizedParticipants = Array.from(new Set((participantIds || []).map(String).filter(Boolean)));
  normalizedParticipants.forEach((participantId) => {
    const isSender = String(participantId) === String(message.senderId);
    if (!includeSender && isSender) return;
    const eventPayload = cloneMessage({
      ...message,
      status: isSender
        ? (message.status || "sent")
        : ((Array.isArray(message.seenBy) && message.seenBy.includes(String(participantId))) ? "read"
          : ((Array.isArray(message.deliveredTo) && message.deliveredTo.includes(String(participantId))) ? "delivered" : "sent")),
    });
    webSocketService.sendToUser(participantId, "message:new", eventPayload);
    webSocketService.sendToUser(participantId, "new_message", eventPayload);
    webSocketService.sendToUser(participantId, "receive_message", eventPayload);
  });
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
  const now = new Date().toISOString();
  return {
    userId: String(userId),
    user_id: String(userId),
    theme: "light",
    notification_enabled: true,
    ringtone_enabled: true,
    dark_mode: false,
    language: "en",
    privacy_last_seen: "everyone",
    privacy_profile_photo: "everyone",
    privacy_status: "everyone",
    read_receipts: true,
    auto_download_media: true,
    font_size: "medium",
    wallpaper: "default",
    call_settings: {
      ringtone: "default",
      vibration: true,
      speaker_default: false,
      video_quality: "auto",
      microphone_default: "default",
      noise_cancellation: true,
      echo_cancellation: true
    },
    chat_settings: {
      wallpaper: "default",
      font_size: "medium",
      auto_download_media: true,
      enter_to_send: false,
      bubble_style: "default"
    },
    appearance: {
      theme: "light",
      accentColor: "#4F46E5",
      fontSize: 16,
      reduceMotion: false,
      language: "en",
      timeFormat: "12h",
      dateFormat: "mm/dd/yyyy",
      moodColorScheme: "vibrant",
      moodAnimation: true
    },
    notifications: {
      enabled: true,
      messageNotifications: true,
      groupNotifications: true,
      friendRequestNotifications: true,
      callNotifications: true,
      statusNotifications: true,
      moodNotifications: true,
      notificationSound: true,
      notificationVibration: true,
      popupNotifications: true,
      doNotDisturb: false
    },
    privacy: {
      whoCanAddMe: "friendsOfFriends",
      readReceipts: true,
      typingIndicators: true,
      messageForwarding: true,
      contactDiscovery: true,
      lastSeen: "everyone",
      onlineStatus: true,
      profileVisibility: "everyone",
      photoVisibility: "everyone",
      statusVisibility: "everyone"
    },
    chat: {
      wallpaper: "default",
      enterKeySends: false,
      mediaDownload: "wifi",
      saveMedia: false,
      messageHistory: "forever",
      disappearingMessages: "off",
      fontSize: "medium",
      autoDownloadMedia: true,
      bubbleStyle: "default"
    },
    friends: {
      discoverByPhone: true,
      discoverByEmail: false,
      nearbyDiscovery: false,
      friendSuggestions: true,
      friendCategories: true
    },
    groups: {
      autoJoinGroups: false,
      groupInvitations: "friends",
      groupPrivacy: "public",
      groupAnnouncements: true,
      groupMediaDownload: true,
      messageApproval: false,
      keywordFiltering: false,
      groupSpamDetection: true,
      memberWarnings: true
    },
    calls: {
      whoCanCallMe: "friends",
      callVerification: false,
      ringtone: "default",
      callVibration: true,
      autoAnswer: false,
      autoReject: false,
      speakerDefault: false,
      videoQuality: "auto",
      microphoneDefault: "default",
      cameraDefault: "front",
      noiseCancellation: true,
      echoCancellation: true,
      liveReactions: true,
      inCallChat: true
    },
    status: {
      visibility: "everyone",
      autoDownloadMedia: true,
      moodAutoShare: false
    },
    account: {
      displayName: "User",
      username: String(userId),
      bio: "Hello! I'm using MoodChat",
      profileVisibility: "everyone",
      photoVisibility: "everyone",
      lastSeen: "everyone",
      onlineStatus: true
    },
    advanced: {
      offlineMode: true,
      lowBandwidth: false,
      debugMode: false,
      dataSaver: false,
      syncEnabled: true
    },
    syncEnabled: true,
    updatedAt: now,
    updated_at: now
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepMergeSettings(target, source) {
  if (!isPlainObject(source)) return target;
  const out = isPlainObject(target) ? { ...target } : {};
  Object.keys(source).forEach((key) => {
    const incoming = source[key];
    if (isPlainObject(incoming) && isPlainObject(out[key])) {
      out[key] = deepMergeSettings(out[key], incoming);
      return;
    }
    if (incoming !== undefined) {
      out[key] = incoming;
    }
  });
  return out;
}

function normalizeFontSize(value) {
  if (value === "small" || value === "medium" || value === "large") return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "medium";
  if (numeric <= 14) return "small";
  if (numeric >= 18) return "large";
  return "medium";
}

function normalizeTheme(theme, darkMode = null) {
  // 'auto'/'system' removed app-wide (frontend audit) — the API should
  // never persist or return a theme value the client no longer resolves.
  // Legacy stored values of 'auto'/'system' fall back to 'light' here too.
  if (theme === "dark" || theme === "light") return theme;
  if (darkMode === true) return "dark";
  if (darkMode === false) return "light";
  return "light";
}

function normalizeUserSettings(userId, incoming = {}) {
  const defaults = defaultSettings(userId);
  const merged = deepMergeSettings(defaults, incoming || {});
  const theme = normalizeTheme(
    merged.appearance?.theme || merged.theme,
    merged.dark_mode
  );
  const language = merged.appearance?.language || merged.language || "en";
  const fontSize = normalizeFontSize(
    merged.chat?.fontSize ||
    merged.chat_settings?.font_size ||
    merged.font_size ||
    merged.appearance?.fontSize
  );
  const wallpaper = merged.chat?.wallpaper || merged.chat_settings?.wallpaper || merged.wallpaper || "default";
  const notificationsEnabled = merged.notification_enabled !== false
    && merged.notifications?.enabled !== false;
  const ringtoneEnabled = merged.ringtone_enabled !== false
    && merged.notifications?.notificationSound !== false;
  const lastSeen = merged.privacy?.lastSeen || merged.privacy_last_seen || "everyone";
  const photoVisibility = merged.privacy?.photoVisibility || merged.privacy_profile_photo || "everyone";
  const statusVisibility = merged.privacy?.statusVisibility || merged.privacy_status || "everyone";
  const readReceipts = merged.privacy?.readReceipts !== false && merged.read_receipts !== false;
  const autoDownloadMedia = merged.chat?.autoDownloadMedia !== false && merged.auto_download_media !== false;
  const now = new Date().toISOString();
  const callSettings = deepMergeSettings(defaults.call_settings, merged.call_settings || {});
  const chatSettings = deepMergeSettings(defaults.chat_settings, merged.chat_settings || {});

  return {
    ...merged,
    userId: String(userId),
    user_id: String(userId),
    theme,
    notification_enabled: notificationsEnabled,
    ringtone_enabled: ringtoneEnabled,
    dark_mode: theme === "dark",
    language,
    privacy_last_seen: lastSeen,
    privacy_profile_photo: photoVisibility,
    privacy_status: statusVisibility,
    read_receipts: readReceipts,
    auto_download_media: autoDownloadMedia,
    font_size: fontSize,
    wallpaper,
    call_settings: {
      ...callSettings,
      ringtone: merged.calls?.ringtone || callSettings.ringtone || "default",
      vibration: merged.calls?.callVibration !== false && callSettings.vibration !== false,
      speaker_default: merged.calls?.speakerDefault === true || callSettings.speaker_default === true,
      video_quality: merged.calls?.videoQuality || callSettings.video_quality || "auto",
      microphone_default: merged.calls?.microphoneDefault || callSettings.microphone_default || "default",
      noise_cancellation: merged.calls?.noiseCancellation !== false && callSettings.noise_cancellation !== false,
      echo_cancellation: merged.calls?.echoCancellation !== false && callSettings.echo_cancellation !== false
    },
    chat_settings: {
      ...chatSettings,
      wallpaper,
      font_size: fontSize,
      auto_download_media: autoDownloadMedia,
      enter_to_send: merged.chat?.enterKeySends === true || chatSettings.enter_to_send === true,
      bubble_style: merged.chat?.bubbleStyle || chatSettings.bubble_style || "default"
    },
    appearance: {
      ...defaults.appearance,
      ...(merged.appearance || {}),
      theme,
      language,
      fontSize: fontSize === "small" ? 14 : fontSize === "large" ? 18 : 16
    },
    notifications: {
      ...defaults.notifications,
      ...(merged.notifications || {}),
      enabled: notificationsEnabled,
      messageNotifications: notificationsEnabled && merged.notifications?.messageNotifications !== false,
      groupNotifications: notificationsEnabled && merged.notifications?.groupNotifications !== false,
      friendRequestNotifications: notificationsEnabled && merged.notifications?.friendRequestNotifications !== false,
      callNotifications: notificationsEnabled && merged.notifications?.callNotifications !== false,
      statusNotifications: notificationsEnabled && merged.notifications?.statusNotifications !== false,
      moodNotifications: notificationsEnabled && merged.notifications?.moodNotifications !== false,
      notificationSound: ringtoneEnabled,
      notificationVibration: merged.notifications?.notificationVibration !== false,
      popupNotifications: notificationsEnabled && merged.notifications?.popupNotifications !== false
    },
    privacy: {
      ...defaults.privacy,
      ...(merged.privacy || {}),
      lastSeen,
      photoVisibility,
      profileVisibility: merged.privacy?.profileVisibility || photoVisibility,
      statusVisibility,
      readReceipts
    },
    chat: {
      ...defaults.chat,
      ...(merged.chat || {}),
      wallpaper,
      fontSize,
      autoDownloadMedia: autoDownloadMedia,
      mediaDownload: autoDownloadMedia ? (merged.chat?.mediaDownload || "wifi") : "never",
      bubbleStyle: merged.chat?.bubbleStyle || merged.chat_settings?.bubble_style || "default",
      enterKeySends: merged.chat?.enterKeySends === true || merged.chat_settings?.enter_to_send === true
    },
    calls: {
      ...defaults.calls,
      ...(merged.calls || {}),
      ringtone: merged.calls?.ringtone || callSettings.ringtone || "default",
      callVibration: merged.calls?.callVibration !== false && callSettings.vibration !== false,
      speakerDefault: merged.calls?.speakerDefault === true || callSettings.speaker_default === true,
      videoQuality: merged.calls?.videoQuality || callSettings.video_quality || "auto",
      microphoneDefault: merged.calls?.microphoneDefault || callSettings.microphone_default || "default",
      noiseCancellation: merged.calls?.noiseCancellation !== false && callSettings.noise_cancellation !== false,
      echoCancellation: merged.calls?.echoCancellation !== false && callSettings.echo_cancellation !== false
    },
    advanced: {
      ...defaults.advanced,
      ...(merged.advanced || {}),
      syncEnabled: merged.advanced?.syncEnabled !== false && merged.syncEnabled !== false
    },
    account: {
      ...defaults.account,
      ...(merged.account || {}),
      profileVisibility: merged.account?.profileVisibility || photoVisibility,
      photoVisibility,
      lastSeen
    },
    status: {
      ...defaults.status,
      ...(merged.status || {}),
      visibility: statusVisibility,
      autoDownloadMedia
    },
    syncEnabled: merged.advanced?.syncEnabled !== false && merged.syncEnabled !== false,
    updatedAt: merged.updatedAt || merged.updated_at || now,
    updated_at: now
  };
}

function buildSettingsPatch(routePath, body = {}) {
  if (routePath === "/settings/theme") {
    const theme = normalizeTheme(body.theme, body.dark_mode);
    return {
      theme,
      dark_mode: theme === "dark",
      appearance: {
        ...(body.accentColor !== undefined ? { accentColor: body.accentColor } : {}),
        ...(body.fontSize !== undefined ? { fontSize: body.fontSize } : {}),
        theme
      }
    };
  }

  if (routePath === "/settings/language") {
    return {
      language: body.language || "en",
      appearance: { language: body.language || "en" }
    };
  }

  if (routePath === "/settings/privacy") {
    return {
      privacy_last_seen: body.lastSeen,
      privacy_profile_photo: body.photoVisibility || body.profileVisibility,
      privacy_status: body.statusVisibility,
      read_receipts: body.readReceipts,
      privacy: {
        ...body,
        ...(body.photoVisibility || body.profileVisibility
          ? {
              photoVisibility: body.photoVisibility || body.profileVisibility,
              profileVisibility: body.profileVisibility || body.photoVisibility
            }
          : {})
      }
    };
  }

  if (routePath === "/settings/notifications") {
    const nextNotifications = { ...body };
    if (body.enabled === false) {
      nextNotifications.messageNotifications = false;
      nextNotifications.groupNotifications = false;
      nextNotifications.friendRequestNotifications = false;
      nextNotifications.callNotifications = false;
      nextNotifications.statusNotifications = false;
      nextNotifications.moodNotifications = false;
      nextNotifications.notificationSound = false;
      nextNotifications.popupNotifications = false;
    }
    return {
      notification_enabled: body.enabled,
      ringtone_enabled: body.notificationSound,
      notifications: nextNotifications
    };
  }

  if (routePath === "/settings/profile") {
    const section = body.section;
    if (section === "appearance") {
      return {
        appearance: { ...body },
        ...(body.theme !== undefined ? { theme: body.theme } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
        ...(body.fontSize !== undefined ? { font_size: normalizeFontSize(body.fontSize) } : {})
      };
    }
    if (section === "account" || section === "profile") {
      return { account: { ...body } };
    }
    return { account: { ...body } };
  }

  return body || {};
}

function saveUserSettings(userId, patch, { replace = false } = {}) {
  const current = ensureUserBucket(devState.settings, String(userId), () => defaultSettings(String(userId)));
  const candidate = replace ? patch : deepMergeSettings(current, patch || {});
  const next = normalizeUserSettings(String(userId), candidate);
  devState.settings.set(String(userId), next);
  scheduleDevStatePersist();
  webSocketService.sendToUser(String(userId), "settings_updated", {
    userId: String(userId),
    settings: next,
    updatedAt: next.updated_at || next.updatedAt || new Date().toISOString()
  });
  return next;
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueIds(values = []) {
  return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean)));
}

function normalizeGroupSettings(settings = {}) {
  return {
    allowMedia: settings.allowMedia !== false,
    allowReactions: settings.allowReactions !== false,
    allowCalls: settings.allowCalls !== false,
    onlyAdminsCanPost: settings.onlyAdminsCanPost === true,
    muteNotifications: settings.muteNotifications === true,
    wallpaper: settings.wallpaper || "default",
    mediaPermissions: settings.mediaPermissions || "all",
    disappearingMessages: settings.disappearingMessages || "off",
    ...settings,
  };
}

function normalizeGroupReactions(reactions = {}) {
  const normalized = {};
  Object.entries(reactions || {}).forEach(([emoji, userIds]) => {
    const users = uniqueIds(Array.isArray(userIds) ? userIds : []);
    if (users.length > 0) normalized[String(emoji)] = users;
  });
  return normalized;
}

function buildGroupMemberSummary(userId, overrides = {}) {
  const normalizedUserId = String(userId);
  const profile = getUserProfile(normalizedUserId) || ensureSeedUser(normalizedUserId);
  return {
    id: normalizedUserId,
    userId: normalizedUserId,
    memberId: normalizedUserId,
    role: overrides.role || "member",
    joinedAt: overrides.joinedAt || new Date().toISOString(),
    displayName: overrides.displayName || profile.displayName || profile.username || normalizedUserId,
    username: overrides.username || profile.username || normalizedUserId,
    avatar: overrides.avatar || profile.avatar || null,
    photoURL: overrides.photoURL || profile.avatar || null,
    online: !!profile.online,
    isOnline: !!profile.online,
    status: profile.online ? "online" : "offline",
    user: {
      id: normalizedUserId,
      username: profile.username || normalizedUserId,
      displayName: profile.displayName || profile.username || normalizedUserId,
      avatar: profile.avatar || null,
      photoURL: profile.avatar || null,
      online: !!profile.online,
      isOnline: !!profile.online,
      status: profile.online ? "online" : "offline",
    },
  };
}

function hydrateGroupRecord(rawGroup = {}) {
  const createdBy = String(rawGroup.createdBy || rawGroup.ownerId || rawGroup.creatorId || "");
  const existingMembers = Array.isArray(rawGroup.members) ? rawGroup.members : [];
  const memberIdsFromMembers = existingMembers.map((member) => member?.userId || member?.id).filter(Boolean);
  const memberIds = uniqueIds([
    createdBy,
    ...(Array.isArray(rawGroup.memberIds) ? rawGroup.memberIds : []),
    ...(Array.isArray(rawGroup.members) ? memberIdsFromMembers : []),
  ]);

  const admins = uniqueIds([
    createdBy,
    ...(Array.isArray(rawGroup.adminIds) ? rawGroup.adminIds : []),
    ...existingMembers
      .filter((member) => String(member?.role || "").toLowerCase() === "admin" || String(member?.role || "").toLowerCase() === "owner")
      .map((member) => member?.userId || member?.id),
  ]);

  const memberMap = new Map(
    existingMembers.map((member) => [String(member?.userId || member?.id), member]).filter(([id]) => !!id)
  );

  const members = memberIds.map((memberId) => {
    const existing = memberMap.get(String(memberId)) || {};
    const role = createdBy && String(memberId) === createdBy
      ? "owner"
      : (admins.includes(String(memberId)) ? "admin" : (existing.role || "member"));
    return buildGroupMemberSummary(memberId, {
      ...existing,
      role,
      joinedAt: existing.joinedAt || rawGroup.createdAt || new Date().toISOString(),
    });
  });

  const messages = Array.isArray(rawGroup.messages)
    ? rawGroup.messages.map((message) => ({
        ...message,
        reactions: normalizeGroupReactions(message?.reactions || {}),
        seenBy: uniqueIds(message?.seenBy || []),
        deliveredTo: uniqueIds(message?.deliveredTo || []),
      }))
    : [];

  const normalizedSettings = normalizeGroupSettings(rawGroup.settings || {});
  const latestMessage = messages[messages.length - 1] || null;

  return {
    id: String(rawGroup.id || `group_${Date.now()}`),
    name: rawGroup.name || "Untitled Group",
    description: rawGroup.description || "",
    topic: rawGroup.topic || "",
    purpose: rawGroup.purpose || "",
    mood: rawGroup.mood || "",
    privacy: rawGroup.privacy || (rawGroup.isPublic ? "public" : "private"),
    isPublic: rawGroup.isPublic === true || rawGroup.privacy === "public",
    theme: rawGroup.theme || "blue",
    avatar: rawGroup.avatar || rawGroup.photoURL || null,
    photoURL: rawGroup.photoURL || rawGroup.avatar || null,
    welcomeMessage: rawGroup.welcomeMessage || "",
    rules: Array.isArray(rawGroup.rules) ? rawGroup.rules : [],
    customReactions: Array.isArray(rawGroup.customReactions) ? rawGroup.customReactions : ["👍", "❤️", "😂", "😮"],
    badges: Array.isArray(rawGroup.badges) ? rawGroup.badges : [],
    postingRule: rawGroup.postingRule || (normalizedSettings.onlyAdminsCanPost ? "admins" : "everyone"),
    quietHours: rawGroup.quietHours || {},
    scheduledPosting: rawGroup.scheduledPosting || {},
    participationModes: rawGroup.participationModes || {},
    moderationSettings: rawGroup.moderationSettings || {},
    createdBy,
    ownerId: createdBy,
    adminIds: admins,
    memberIds,
    members,
    settings: normalizedSettings,
    messages,
    typingUsers: rawGroup.typingUsers && typeof rawGroup.typingUsers === "object" ? rawGroup.typingUsers : {},
    transparency: Array.isArray(rawGroup.transparency) ? rawGroup.transparency : [],
    links: Array.isArray(rawGroup.links) ? rawGroup.links : [],
    media: Array.isArray(rawGroup.media) ? rawGroup.media : [],
    files: Array.isArray(rawGroup.files) ? rawGroup.files : [],
    createdAt: rawGroup.createdAt || new Date().toISOString(),
    updatedAt: rawGroup.updatedAt || rawGroup.createdAt || new Date().toISOString(),
    lastMessageAt: rawGroup.lastMessageAt || latestMessage?.createdAt || rawGroup.updatedAt || rawGroup.createdAt || new Date().toISOString(),
    lastMessage: rawGroup.lastMessage || latestMessage?.content || "",
    latestMessage,
  };
}

function getGroupUserRole(group, userId) {
  const normalizedUserId = String(userId || "");
  if (!group || !normalizedUserId) return "member";
  if (String(group.createdBy) === normalizedUserId) return "owner";
  if (Array.isArray(group.adminIds) && group.adminIds.map(String).includes(normalizedUserId)) return "admin";
  const member = Array.isArray(group.members)
    ? group.members.find((item) => String(item?.userId || item?.id) === normalizedUserId)
    : null;
  return member?.role || "member";
}

function isGroupMember(group, userId) {
  return !!group && uniqueIds(group.memberIds || []).includes(String(userId));
}

function isGroupAdmin(group, userId) {
  const role = getGroupUserRole(group, userId);
  return role === "owner" || role === "admin";
}

function serializeGroupForViewer(rawGroup, viewerId, { includeMessages = false, includeMembers = true } = {}) {
  const group = hydrateGroupRecord(rawGroup);
  const role = getGroupUserRole(group, viewerId);
  const isCreator = String(group.createdBy) === String(viewerId);
  const isAdmin = role === "owner" || role === "admin";

  return {
    ...group,
    role,
    isCreator,
    isAdmin,
    memberCount: group.memberIds.length,
    stats: {
      totalMembers: group.memberIds.length,
      messages: group.messages.length,
    },
    members: includeMembers ? group.members : undefined,
    messages: includeMessages ? group.messages : undefined,
    latestMessage: group.latestMessage || group.messages[group.messages.length - 1] || null,
  };
}

function getGroupCopies(groupId) {
  const copies = [];
  for (const [ownerId, groups] of devState.groups.entries()) {
    const bucket = Array.isArray(groups) ? groups : [];
    const index = bucket.findIndex((group) => String(group?.id) === String(groupId));
    if (index >= 0) {
      copies.push({ ownerId: String(ownerId), bucket, index, group: bucket[index] });
    }
  }
  return copies;
}

function findGroupAcrossUsers(groupId) {
  const copies = getGroupCopies(groupId);
  return copies.length > 0 ? hydrateGroupRecord(copies[0].group) : null;
}

function syncGroupToMemberBuckets(rawGroup) {
  const group = hydrateGroupRecord(rawGroup);
  const memberIds = uniqueIds(group.memberIds || []);

  memberIds.forEach((memberId) => {
    const bucket = ensureUserBucket(devState.groups, memberId, () => []);
    const nextGroup = serializeGroupForViewer(group, memberId, { includeMessages: true, includeMembers: true });
    const index = bucket.findIndex((item) => String(item?.id) === String(group.id));
    if (index >= 0) bucket[index] = nextGroup;
    else bucket.unshift(nextGroup);
  });

  for (const [ownerId, groups] of devState.groups.entries()) {
    if (memberIds.includes(String(ownerId))) continue;
    devState.groups.set(
      String(ownerId),
      (Array.isArray(groups) ? groups : []).filter((groupItem) => String(groupItem?.id) !== String(group.id))
    );
  }

  return group;
}

function removeGroupFromAllBuckets(groupId) {
  for (const [ownerId, groups] of devState.groups.entries()) {
    devState.groups.set(
      String(ownerId),
      (Array.isArray(groups) ? groups : []).filter((group) => String(group?.id) !== String(groupId))
    );
  }
}

function broadcastGroupEvent(rawGroup, eventNames, payload, { exceptUserId = null } = {}) {
  const group = hydrateGroupRecord(rawGroup);
  const events = Array.isArray(eventNames) ? eventNames : [eventNames];
  uniqueIds(group.memberIds || []).forEach((memberId) => {
    if (exceptUserId && String(memberId) === String(exceptUserId)) return;
    events.forEach((eventName) => {
      webSocketService.sendToUser(memberId, eventName, payload);
    });
  });
}

function recordGroupTransparency(group, action, details = "") {
  const nextGroup = hydrateGroupRecord(group);
  nextGroup.transparency = Array.isArray(nextGroup.transparency) ? nextGroup.transparency : [];
  nextGroup.transparency.unshift({
    id: `group_log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
  nextGroup.transparency = nextGroup.transparency.slice(0, 100);
  return nextGroup;
}

function buildGroupReplySummary(group, replyToId) {
  if (!replyToId) return null;
  const normalizedGroup = hydrateGroupRecord(group);
  const replyTo = normalizedGroup.messages.find((message) => String(message.id) === String(replyToId));
  if (!replyTo) return null;
  return {
    id: replyTo.id,
    messageId: replyTo.id,
    content: replyTo.content || "",
    type: replyTo.type || "text",
    senderId: replyTo.senderId,
    senderName: replyTo.senderName || getUserProfile(replyTo.senderId)?.displayName || String(replyTo.senderId),
  };
}

function buildStoredGroupMessage(group, senderId, input = {}) {
  const normalizedGroup = hydrateGroupRecord(group);
  const profile = getUserProfile(senderId) || ensureSeedUser(senderId);
  const createdAt = new Date().toISOString();
  const attachment = input.attachment || input.metadata?.attachment || null;
  const mediaUrl = input.mediaUrl || attachment?.url || input.metadata?.url || input.metadata?.mediaUrl || null;
  const mimeType = input.mimeType || attachment?.mimeType || input.metadata?.mimeType || null;
  const inferredType = input.type
    || attachment?.type
    || (mimeType?.startsWith("image/") ? "image" : mimeType?.startsWith("audio/") ? "audio" : mimeType?.startsWith("video/") ? "video" : (mediaUrl ? "file" : "text"));
  const content = String(input.content || input.text || input.body || input.caption || "").trim();
  const replyToId = normalizeEntityId(input.replyToId || input.replyTo?.id || input.replyTo);
  const replyTo = buildGroupReplySummary(normalizedGroup, replyToId);
  const otherMembers = uniqueIds(normalizedGroup.memberIds || []).filter((memberId) => String(memberId) !== String(senderId));

  return {
    id: input.id || `group_msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    localId: input.localId || null,
    serverId: input.serverId || null,
    groupId: String(normalizedGroup.id),
    senderId: String(senderId),
    senderName: input.senderName || profile.displayName || profile.username || String(senderId),
    senderAvatar: input.senderAvatar || profile.avatar || null,
    sender: {
      id: String(senderId),
      userId: String(senderId),
      displayName: profile.displayName || profile.username || String(senderId),
      username: profile.username || String(senderId),
      avatar: profile.avatar || null,
    },
    type: inferredType,
    content,
    text: content,
    body: content,
    mediaUrl,
    media_url: mediaUrl,
    imageUrl: inferredType === "image" ? mediaUrl : null,
    thumbnailUrl: input.thumbnailUrl || attachment?.thumbnailUrl || input.metadata?.thumbnailUrl || null,
    fileName: input.fileName || attachment?.name || input.metadata?.fileName || null,
    file_name: input.fileName || attachment?.name || input.metadata?.fileName || null,
    mimeType,
    size: input.size || attachment?.size || input.metadata?.size || null,
    replyToId,
    replyTo,
    metadata: input.metadata || {},
    attachment: attachment || (mediaUrl ? {
      url: mediaUrl,
      thumbnailUrl: input.thumbnailUrl || null,
      name: input.fileName || null,
      mimeType,
      size: input.size || null,
      type: inferredType,
    } : null),
    reactions: normalizeGroupReactions(input.reactions || {}),
    seenBy: [String(senderId)],
    deliveredTo: otherMembers,
    createdAt,
    updatedAt: createdAt,
    sentAt: createdAt,
    deliveredAt: otherMembers.length > 0 ? createdAt : null,
    readAt: null,
    status: otherMembers.length > 0 ? "delivered" : "sent",
    deleted: false,
    edited: false,
    deletedForEveryone: false,
  };
}

function upsertGroupMessage(group, message) {
  const normalizedGroup = hydrateGroupRecord(group);
  const messages = Array.isArray(normalizedGroup.messages) ? normalizedGroup.messages : [];
  const existingIndex = messages.findIndex((item) => String(item?.id) === String(message?.id));
  if (existingIndex >= 0) messages[existingIndex] = { ...messages[existingIndex], ...message };
  else messages.push(message);
  messages.sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0));
  normalizedGroup.messages = messages;
  normalizedGroup.lastMessage = message.content || message.fileName || message.type || "";
  normalizedGroup.lastMessageAt = message.createdAt || new Date().toISOString();
  normalizedGroup.updatedAt = new Date().toISOString();

  if (message.mediaUrl) {
    const mediaEntry = {
      id: message.id,
      url: message.mediaUrl,
      thumbnailUrl: message.thumbnailUrl || null,
      type: message.type,
      fileName: message.fileName || null,
      createdAt: message.createdAt,
      senderId: message.senderId,
    };
    normalizedGroup.media = Array.isArray(normalizedGroup.media) ? normalizedGroup.media : [];
    normalizedGroup.media.unshift(mediaEntry);
    normalizedGroup.media = normalizedGroup.media.slice(0, 500);
    if (message.type !== "image" && message.type !== "video") {
      normalizedGroup.files = Array.isArray(normalizedGroup.files) ? normalizedGroup.files : [];
      normalizedGroup.files.unshift(mediaEntry);
      normalizedGroup.files = normalizedGroup.files.slice(0, 500);
    }
  }

  return normalizedGroup;
}

function markGroupSeenByViewer(group, viewerId) {
  const normalizedGroup = hydrateGroupRecord(group);
  let changed = false;
  normalizedGroup.messages = normalizedGroup.messages.map((message) => {
    if (String(message.senderId) === String(viewerId)) return message;
    const seenBy = uniqueIds(message.seenBy || []);
    const deliveredTo = uniqueIds(message.deliveredTo || []);
    if (!deliveredTo.includes(String(viewerId))) deliveredTo.push(String(viewerId));
    if (!seenBy.includes(String(viewerId))) {
      seenBy.push(String(viewerId));
      changed = true;
    }
    return {
      ...message,
      seenBy,
      deliveredTo,
      readAt: seenBy.includes(String(viewerId)) ? (message.readAt || new Date().toISOString()) : message.readAt,
      status: seenBy.length > 1 ? "seen" : (deliveredTo.length > 0 ? "delivered" : (message.status || "sent")),
    };
  });
  return { group: normalizedGroup, changed };
}

function listGroupsForUser(userId) {
  const bucket = ensureUserBucket(devState.groups, String(userId), () => []);
  const groups = bucket.map((group) => serializeGroupForViewer(group, userId, { includeMessages: false, includeMembers: true }));
  const myGroups = groups.filter((group) => group.isCreator);
  const joinedGroups = groups.filter((group) => !group.isCreator);
  const adminGroups = groups.filter((group) => group.isAdmin);
  return { groups, myGroups, joinedGroups, adminGroups };
}

async function storeUploadedMedia(file, { folder = "groups" } = {}) {
  if (!file) return null;

  if (isCloudinaryConfigured) {
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `uniconnect/${folder}`,
          resource_type: "auto",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(file.buffer);
    });

    return {
      id: uploadResult.public_id,
      url: uploadResult.secure_url,
      thumbnailUrl: uploadResult.secure_url,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      source: "cloudinary",
      publicId: uploadResult.public_id,
    };
  }

  ensureDevStateDir();
  const safeBaseName = String(file.originalname || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${safeBaseName}`;
  const storedPath = path.join(DEV_UPLOADS_DIR, storedName);
  fs.writeFileSync(storedPath, file.buffer);

  return {
    id: storedName,
    url: `/data/uploads/${storedName}`,
    thumbnailUrl: `/data/uploads/${storedName}`,
    fileName: file.originalname,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    source: "local",
    path: storedPath,
  };
}

hydrateDevState();

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

  if (normalizedType === "join_group" || normalizedType === "group:join") {
    const groupId = normalizeEntityId(payload.groupId || payload.id);
    const group = groupId ? findGroupAcrossUsers(groupId) : null;
    if (group && isGroupMember(group, user.id)) {
      webSocketService.sendToUser(user.id, "group:joined", {
        groupId,
        group: serializeGroupForViewer(group, user.id, { includeMessages: false, includeMembers: true }),
        joinedAt: Date.now(),
      });
    }
    return;
  }

  if (normalizedType === "leave_group" || normalizedType === "group:leave") {
    const groupId = normalizeEntityId(payload.groupId || payload.id);
    const group = groupId ? findGroupAcrossUsers(groupId) : null;
    if (group && isGroupMember(group, user.id)) {
      const updatedGroup = hydrateGroupRecord(group);
      updatedGroup.memberIds = uniqueIds(updatedGroup.memberIds || []).filter((memberId) => String(memberId) !== String(user.id));
      updatedGroup.members = updatedGroup.members.filter((member) => String(member.userId || member.id) !== String(user.id));
      updatedGroup.adminIds = uniqueIds(updatedGroup.adminIds || []).filter((adminId) => String(adminId) !== String(user.id));
      updatedGroup.updatedAt = new Date().toISOString();
      syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_left", `${user.id} left the group`));
      scheduleDevStatePersist();
    }
    return;
  }

  if (
    normalizedType === "send_group_message"
    || normalizedType === "group:message"
    || normalizedType === "group_message"
    || normalizedType === "receive_group_message"
  ) {
    const groupId = normalizeEntityId(payload.groupId || payload.group_id);
    const group = groupId ? findGroupAcrossUsers(groupId) : null;
    if (!group || !isGroupMember(group, user.id)) return;

    const message = buildStoredGroupMessage(group, user.id, payload);
    const updatedGroup = syncGroupToMemberBuckets(upsertGroupMessage(group, message));
    scheduleDevStatePersist();

    const eventPayload = { groupId: updatedGroup.id, group_id: updatedGroup.id, message };
    broadcastGroupEvent(updatedGroup, ["group:message", "group_message", "receive_group_message"], eventPayload);
    return;
  }

  if (normalizedType === "typing" || normalizedType === "group:typing" || normalizedType === "stop_typing") {
    const groupId = normalizeEntityId(payload.groupId || payload.group_id);
    const group = groupId ? findGroupAcrossUsers(groupId) : null;
    if (!group || !isGroupMember(group, user.id)) return;
    const updatedGroup = hydrateGroupRecord(group);
    updatedGroup.typingUsers = updatedGroup.typingUsers && typeof updatedGroup.typingUsers === "object" ? updatedGroup.typingUsers : {};
    const isTyping = normalizedType !== "stop_typing" && payload.typing !== false;
    if (isTyping) {
      updatedGroup.typingUsers[String(user.id)] = Date.now();
    } else {
      delete updatedGroup.typingUsers[String(user.id)];
    }
    syncGroupToMemberBuckets(updatedGroup);
    scheduleDevStatePersist();
    broadcastGroupEvent(updatedGroup, "group:typing", {
      groupId: updatedGroup.id,
      userId: String(user.id),
      isTyping,
      typing: isTyping,
      timestamp: Date.now(),
    }, { exceptUserId: String(user.id) });
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
    const userSettings = saveUserSettings(safeId, ensureUserBucket(devState.settings, safeId, () => defaultSettings(safeId)));
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
        data: { token, refreshToken: null, user: userRecord, settings: userSettings },
        token,
        user: userRecord,
        settings: userSettings,
      },
    };
  }

  if (routePath === "/auth/me" || routePath === "/auth/verify") {
    if (!user) {
      return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    }
    return {
      body: {
        success: true,
        data: {
          user,
          settings: normalizeUserSettings(user.id, ensureUserBucket(devState.settings, user.id, () => defaultSettings(user.id)))
        },
        user
      }
    };
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

  if (routePath === "/settings/reset" && method === "POST") {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const resetSettings = saveUserSettings(user.id, defaultSettings(user.id), { replace: true });
    return { body: { success: true, data: { settings: resetSettings }, settings: resetSettings } };
  }

  if (routePath.startsWith("/settings")) {
    if (!user) return { status: 401, body: { success: false, error: "Unauthorized", data: null } };
    const current = normalizeUserSettings(user.id, ensureUserBucket(devState.settings, user.id, () => defaultSettings(user.id)));
    devState.settings.set(user.id, current);
    if (method === "GET") {
      return { body: { success: true, data: { settings: current }, settings: current } };
    }

    const patch = routePath === "/settings"
      ? (req.body || {})
      : buildSettingsPatch(routePath, req.body || {});
    const next = saveUserSettings(user.id, patch);
    return { body: { success: true, data: { settings: next }, settings: next } };
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
    const chats = ensureUserBucket(devState.chats, user.id, () => []);
    const summaries = chats
      .map((chat) => buildChatSummaryForUser(user.id, chat))
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));

    if (routePath === "/messages/unread-counts") {
      const counts = {};
      summaries.forEach((summary) => {
        counts[String(summary.chatId)] = summary.unreadCount || 0;
      });
      return { body: { success: true, data: counts } };
    }

    if (routePath === "/messages/chats" || routePath === "/chats" || routePath === "/conversations") {
      return { body: { success: true, data: summaries, chats: summaries } };
    }

    const chatId = req.query.chatId || req.body?.chatId || req.params?.chatId || "default";
    const existing = chats.find((chat) => String(chat.id) === String(chatId)) || ensureChatRecord(user.id, chatId, [user.id]);
    return {
      body: {
        success: true,
        data: {
          chats: summaries,
          messages: getVisibleChatMessages(existing, user.id),
          unread: buildChatSummaryForUser(user.id, existing).unreadCount || 0,
        },
      },
    };
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
  const userSettings = saveUserSettings(safeId, ensureUserBucket(devState.settings, safeId, () => defaultSettings(safeId)));

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
      settings: userSettings,
      userId: userRecord.id,
      authenticated: true,
    },
    message: "Login successful",
  });
});

app.get("/api/auth/me", apiLimiter, authMiddleware, (req, res) => {
  const settings = normalizeUserSettings(req.user.id, ensureUserBucket(devState.settings, req.user.id, () => defaultSettings(req.user.id)));
  devState.settings.set(req.user.id, settings);
  return res.status(200).json({
    success: true,
    data: {
      user: req.user,
      settings,
      userId: req.user.id,
      authenticated: true,
    },
    message: "Authenticated user loaded",
  });
});

app.get("/api/auth/verify", apiLimiter, authMiddleware, (req, res) => {
  const settings = normalizeUserSettings(req.user.id, ensureUserBucket(devState.settings, req.user.id, () => defaultSettings(req.user.id)));
  devState.settings.set(req.user.id, settings);
  return res.status(200).json({
    success: true,
    data: {
      valid: true,
      authenticated: true,
      user: req.user,
      settings,
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

app.post("/api/media/upload", apiLimiter, authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, "No file uploaded", 400);
    }

    const media = await storeUploadedMedia(req.file, { folder: "media" });
    console.log("[GROUP_MEDIA_UPLOAD]", {
      userId: String(req.user.id),
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: media?.url || null,
    });

    return sendSuccess(res, { media }, 201, "Media uploaded");
  } catch (error) {
    console.error("[GROUP_MEDIA_UPLOAD_ERROR]", error.message);
    return sendError(res, "Media upload failed", 500);
  }
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

app.get("/api/groups/purposes", apiLimiter, authMiddleware, (_req, res) => {
  return sendSuccess(res, {
    purposes: [
      "Study",
      "Work",
      "Family",
      "Friends",
      "Community",
      "Announcements",
      "Support",
    ],
  }, 200, "Group purposes loaded");
});

app.get("/api/groups/moods", apiLimiter, authMiddleware, (_req, res) => {
  return sendSuccess(res, {
    moods: ["calm", "energetic", "focused", "celebration", "serious", "creative"],
  }, 200, "Group moods loaded");
});

app.get("/api/groups/user", apiLimiter, authMiddleware, (req, res) => {
  return sendSuccess(res, listGroupsForUser(req.user.id), 200, "Groups loaded");
});

app.get("/api/groups", apiLimiter, authMiddleware, (req, res) => {
  return sendSuccess(res, listGroupsForUser(req.user.id), 200, "Groups loaded");
});

app.post("/api/groups", apiLimiter, authMiddleware, (req, res) => {
  const creatorId = String(req.user.id);
  const requestedMembers = uniqueIds([
    creatorId,
    ...(Array.isArray(req.body?.memberIds) ? req.body.memberIds : []),
    ...(Array.isArray(req.body?.members) ? req.body.members : []),
  ]);

  const createdGroup = hydrateGroupRecord({
    id: `group_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    name: String(req.body?.name || "Untitled Group").trim() || "Untitled Group",
    description: String(req.body?.description || ""),
    topic: String(req.body?.topic || ""),
    purpose: String(req.body?.purpose || ""),
    mood: String(req.body?.mood || ""),
    privacy: req.body?.privacy === "public" ? "public" : "private",
    isPublic: req.body?.privacy === "public",
    theme: req.body?.theme || "blue",
    photoURL: req.body?.photoURL || req.body?.avatar || null,
    avatar: req.body?.avatar || req.body?.photoURL || null,
    welcomeMessage: req.body?.welcomeMessage || "",
    rules: Array.isArray(req.body?.rules) ? req.body.rules : [],
    customReactions: Array.isArray(req.body?.customReactions) ? req.body.customReactions : ["👍", "❤️", "😂", "😮"],
    badges: Array.isArray(req.body?.badges) ? req.body.badges : [],
    postingRule: req.body?.postingRule || "everyone",
    quietHours: req.body?.quietHours || {},
    scheduledPosting: req.body?.scheduledPosting || {},
    participationModes: req.body?.participationModes || {},
    moderationSettings: req.body?.moderationSettings || {},
    settings: req.body?.settings || {},
    createdBy: creatorId,
    memberIds: requestedMembers,
    adminIds: [creatorId],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transparency: [{
      id: `group_log_${Date.now()}`,
      action: "group_created",
      details: `Created by ${creatorId}`,
      createdAt: new Date().toISOString(),
    }],
  });

  const storedGroup = syncGroupToMemberBuckets(createdGroup);
  scheduleDevStatePersist();

  const responseGroup = serializeGroupForViewer(storedGroup, creatorId, { includeMessages: false, includeMembers: true });
  console.log("[GROUP_CREATE]", { groupId: storedGroup.id, creatorId, members: storedGroup.memberIds.length });
  broadcastGroupEvent(storedGroup, ["group:created", "group_created"], { group: responseGroup, ...responseGroup });
  broadcastGroupEvent(storedGroup, "group:refresh_needed", { groupId: storedGroup.id });

  return sendSuccess(res, responseGroup, 201, "Group created");
});

app.get("/api/groups/:groupId", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id) && !group.isPublic) {
    return sendError(res, "Access denied", 403);
  }
  return sendSuccess(res, serializeGroupForViewer(group, req.user.id, { includeMessages: false, includeMembers: true }), 200, "Group loaded");
});

app.put("/api/groups/:groupId", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupAdmin(group, req.user.id)) return sendError(res, "Only admins can update this group", 403);

  const updatedGroup = hydrateGroupRecord({
    ...group,
    name: req.body?.name ?? group.name,
    description: req.body?.description ?? group.description,
    topic: req.body?.topic ?? group.topic,
    purpose: req.body?.purpose ?? group.purpose,
    mood: req.body?.mood ?? group.mood,
    privacy: req.body?.privacy ?? group.privacy,
    isPublic: (req.body?.privacy ?? group.privacy) === "public",
    theme: req.body?.theme ?? group.theme,
    photoURL: req.body?.photoURL ?? req.body?.avatar ?? group.photoURL,
    avatar: req.body?.avatar ?? req.body?.photoURL ?? group.avatar,
    postingRule: req.body?.postingRule ?? group.postingRule,
    quietHours: req.body?.quietHours ?? group.quietHours,
    scheduledPosting: req.body?.scheduledPosting ?? group.scheduledPosting,
    participationModes: req.body?.participationModes ?? group.participationModes,
    moderationSettings: req.body?.moderationSettings ?? group.moderationSettings,
    settings: normalizeGroupSettings({ ...(group.settings || {}), ...(req.body?.settings || {}) }),
    updatedAt: new Date().toISOString(),
  });

  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "group_updated", `Updated by ${req.user.id}`));
  scheduleDevStatePersist();
  const payload = serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true });
  broadcastGroupEvent(storedGroup, "group:updated", { group: payload, ...payload });
  broadcastGroupEvent(storedGroup, "group:refresh_needed", { groupId: storedGroup.id });
  return sendSuccess(res, payload, 200, "Group updated");
});

app.put("/api/groups/:groupId/settings", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupAdmin(group, req.user.id)) return sendError(res, "Only admins can change settings", 403);

  const updatedGroup = hydrateGroupRecord({
    ...group,
    settings: normalizeGroupSettings({ ...(group.settings || {}), ...(req.body?.settings || req.body || {}) }),
    updatedAt: new Date().toISOString(),
  });

  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "settings_updated", `Settings updated by ${req.user.id}`));
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, "group:updated", {
    group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }),
  });
  return sendSuccess(res, { settings: storedGroup.settings, group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }) }, 200, "Group settings updated");
});

app.delete("/api/groups/:groupId", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (String(group.createdBy) !== String(req.user.id)) return sendError(res, "Only the owner can delete this group", 403);

  removeGroupFromAllBuckets(group.id);
  scheduleDevStatePersist();
  broadcastGroupEvent(group, ["group:deleted", "group_deleted"], { groupId: group.id, deletedBy: String(req.user.id) });
  return sendSuccess(res, { groupId: group.id, deleted: true }, 200, "Group deleted");
});

app.post("/api/groups/:groupId/join", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (isGroupMember(group, userId)) {
    return sendSuccess(res, { group: serializeGroupForViewer(group, userId, { includeMessages: false, includeMembers: true }), joined: false }, 200, "Already joined");
  }

  const invites = ensureUserBucket(devState.groupInvites, userId, () => []);
  const invited = invites.some((invite) => String(invite.groupId) === String(group.id));
  if (!group.isPublic && !invited) {
    return sendError(res, "This private group requires an invitation", 403);
  }

  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.memberIds = uniqueIds([...(updatedGroup.memberIds || []), userId]);
  updatedGroup.members.push(buildGroupMemberSummary(userId, { role: "member" }));
  updatedGroup.updatedAt = new Date().toISOString();
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_joined", `${userId} joined the group`));
  devState.groupInvites.set(userId, invites.filter((invite) => String(invite.groupId) !== String(group.id)));
  scheduleDevStatePersist();

  const memberPayload = { groupId: storedGroup.id, memberId: userId, userId, member: buildGroupMemberSummary(userId, { role: "member" }) };
  broadcastGroupEvent(storedGroup, ["group:member:joined", "group:member:added", "GROUP_MEMBER_ADDED", "group:membership_change"], memberPayload);
  broadcastGroupEvent(storedGroup, "group:refresh_needed", { groupId: storedGroup.id });
  console.log("[GROUP_JOIN]", { groupId: storedGroup.id, userId });

  return sendSuccess(res, { group: serializeGroupForViewer(storedGroup, userId, { includeMessages: false, includeMembers: true }), joined: true }, 200, "Joined group");
});

app.post("/api/groups/:groupId/leave", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, userId)) return sendError(res, "You are not a member of this group", 403);
  if (String(group.createdBy) === userId) return sendError(res, "The owner cannot leave without deleting the group", 400);

  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.memberIds = uniqueIds(updatedGroup.memberIds || []).filter((memberId) => String(memberId) !== userId);
  updatedGroup.members = updatedGroup.members.filter((member) => String(member.userId || member.id) !== userId);
  updatedGroup.adminIds = uniqueIds(updatedGroup.adminIds || []).filter((adminId) => String(adminId) !== userId);
  updatedGroup.updatedAt = new Date().toISOString();
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_left", `${userId} left the group`));
  scheduleDevStatePersist();

  const memberPayload = { groupId: storedGroup.id, memberId: userId, userId };
  broadcastGroupEvent(storedGroup, ["group:member:left", "group:member:removed", "GROUP_MEMBER_REMOVED"], memberPayload);
  broadcastGroupEvent(storedGroup, "group:refresh_needed", { groupId: storedGroup.id });
  console.log("[GROUP_LEAVE]", { groupId: storedGroup.id, userId });

  return sendSuccess(res, { groupId: storedGroup.id, left: true }, 200, "Left group");
});

app.get("/api/groups/:groupId/members", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  return sendSuccess(res, { members: group.members, total: group.members.length }, 200, "Members loaded");
});

app.post("/api/group-members/:groupId/invitations", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  const inviteeId = normalizeEntityId(req.body?.inviteeId || req.body?.userId || req.body?.memberId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!inviteeId) return sendError(res, "inviteeId is required", 400);
  if (!isGroupAdmin(group, req.user.id)) return sendError(res, "Only admins can invite", 403);
  ensureSeedUser(inviteeId);

  if (isGroupMember(group, inviteeId)) {
    return sendSuccess(res, { action: "already_member", groupId: group.id, inviteeId }, 200, "User is already a member");
  }

  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.memberIds = uniqueIds([...(updatedGroup.memberIds || []), inviteeId]);
  updatedGroup.members.push(buildGroupMemberSummary(inviteeId, { role: "member" }));
  updatedGroup.updatedAt = new Date().toISOString();
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_added", `${inviteeId} added by ${req.user.id}`));
  scheduleDevStatePersist();

  const memberPayload = { groupId: storedGroup.id, memberId: inviteeId, userId: inviteeId, member: buildGroupMemberSummary(inviteeId, { role: "member" }) };
  broadcastGroupEvent(storedGroup, ["group:member:joined", "group:member:added", "GROUP_MEMBER_ADDED", "group:membership_change"], memberPayload);
  webSocketService.sendToUser(inviteeId, "group:created", { group: serializeGroupForViewer(storedGroup, inviteeId, { includeMessages: false, includeMembers: true }) });
  webSocketService.sendToUser(inviteeId, "group:refresh_needed", { groupId: storedGroup.id });

  return sendSuccess(res, { action: "member_added", group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }), inviteeId }, 200, "Member added");
});

app.post("/api/groups/:groupId/members/:memberId/promote", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  const memberId = String(req.params.memberId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupAdmin(group, req.user.id)) return sendError(res, "Only admins can promote", 403);
  if (!isGroupMember(group, memberId)) return sendError(res, "Member not found", 404);

  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.adminIds = uniqueIds([...(updatedGroup.adminIds || []), memberId]);
  updatedGroup.members = updatedGroup.members.map((member) => (
    String(member.userId || member.id) === memberId ? { ...member, role: "admin" } : member
  ));
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_promoted", `${memberId} promoted by ${req.user.id}`));
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, "group:updated", { group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }) });
  return sendSuccess(res, { group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }), memberId }, 200, "Member promoted");
});

app.post("/api/groups/:groupId/members/:memberId/demote", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  const memberId = String(req.params.memberId);
  if (!group) return sendError(res, "Group not found", 404);
  if (String(group.createdBy) !== String(req.user.id)) return sendError(res, "Only the owner can demote admins", 403);
  if (!isGroupMember(group, memberId)) return sendError(res, "Member not found", 404);

  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.adminIds = uniqueIds(updatedGroup.adminIds || []).filter((adminId) => String(adminId) !== memberId && String(adminId) !== String(group.createdBy));
  updatedGroup.members = updatedGroup.members.map((member) => (
    String(member.userId || member.id) === memberId ? { ...member, role: "member" } : member
  ));
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_demoted", `${memberId} demoted by ${req.user.id}`));
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, "group:updated", { group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }) });
  return sendSuccess(res, { group: serializeGroupForViewer(storedGroup, req.user.id, { includeMessages: false, includeMembers: true }), memberId }, 200, "Member demoted");
});

app.delete("/api/groups/:groupId/members/:memberId", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  const memberId = String(req.params.memberId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupAdmin(group, req.user.id)) return sendError(res, "Only admins can remove members", 403);
  if (!isGroupMember(group, memberId)) return sendError(res, "Member not found", 404);
  if (String(group.createdBy) === memberId) return sendError(res, "Cannot remove the group owner", 400);

  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.memberIds = uniqueIds(updatedGroup.memberIds || []).filter((id) => String(id) !== memberId);
  updatedGroup.members = updatedGroup.members.filter((member) => String(member.userId || member.id) !== memberId);
  updatedGroup.adminIds = uniqueIds(updatedGroup.adminIds || []).filter((id) => String(id) !== memberId);
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "member_removed", `${memberId} removed by ${req.user.id}`));
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, ["group:member:removed", "GROUP_MEMBER_REMOVED"], { groupId: storedGroup.id, memberId, userId: memberId });
  webSocketService.sendToUser(memberId, "group:refresh_needed", { groupId: storedGroup.id });
  return sendSuccess(res, { groupId: storedGroup.id, memberId, removed: true }, 200, "Member removed");
});

app.get("/api/groups/:groupId/messages", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, userId)) return sendError(res, "Access denied", 403);

  const limit = Math.max(1, Number(req.query.limit || 80));
  const before = req.query.before ? Date.parse(req.query.before) : null;
  let messages = Array.isArray(group.messages) ? group.messages : [];
  if (Number.isFinite(before)) {
    messages = messages.filter((message) => Date.parse(message.createdAt || 0) < before);
  }
  messages = messages.slice(-limit);

  const seenResult = markGroupSeenByViewer(group, userId);
  if (seenResult.changed) {
    syncGroupToMemberBuckets(seenResult.group);
    scheduleDevStatePersist();
  }

  console.log("[GROUP_MESSAGES_LOAD]", { groupId: group.id, userId, count: messages.length });
  return sendSuccess(res, messages, 200, "Group messages loaded");
});

app.post("/api/groups/:groupId/messages", apiLimiter, authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const userId = String(req.user.id);
    const group = findGroupAcrossUsers(req.params.groupId);
    if (!group) return sendError(res, "Group not found", 404);
    if (!isGroupMember(group, userId)) return sendError(res, "Access denied", 403);
    if (group.settings?.onlyAdminsCanPost === true && !isGroupAdmin(group, userId)) {
      return sendError(res, "Only admins can post in this group", 403);
    }

    let attachment = req.body?.metadata?.attachment || null;
    let metadata = req.body?.metadata;
    if (typeof metadata === "string") {
      try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
    }
    if (metadata && typeof metadata === "object" && metadata.attachment) attachment = metadata.attachment;

    if (req.file) {
      if (group.settings?.allowMedia === false) {
        return sendError(res, "Media sharing is disabled in this group", 403);
      }
      const media = await storeUploadedMedia(req.file, { folder: "groups" });
      attachment = {
        id: media.id,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        name: media.originalName || media.fileName || req.file.originalname,
        mimeType: media.mimeType || req.file.mimetype,
        size: media.size || req.file.size,
        type: req.body?.type || (req.file.mimetype.startsWith("image/") ? "image" : req.file.mimetype.startsWith("audio/") ? "audio" : req.file.mimetype.startsWith("video/") ? "video" : "file"),
      };
      metadata = { ...(metadata || {}), attachment };
    }

    const content = String(req.body?.content || req.body?.text || "").trim();
    if (!content && !attachment) {
      return sendError(res, "Message content or media is required", 400);
    }

    const message = buildStoredGroupMessage(group, userId, {
      type: req.body?.type || attachment?.type || "text",
      content,
      replyToId: req.body?.replyToId || req.body?.replyTo,
      localId: req.body?.localId || null,
      metadata: metadata || {},
      attachment,
    });

    const storedGroup = syncGroupToMemberBuckets(upsertGroupMessage(group, message));
    scheduleDevStatePersist();

    const payload = { groupId: storedGroup.id, group_id: storedGroup.id, message };
    broadcastGroupEvent(storedGroup, ["group:message", "group_message", "receive_group_message"], payload);
    console.log("[GROUP_MESSAGE_SEND]", { groupId: storedGroup.id, userId, messageId: message.id, type: message.type, media: !!message.mediaUrl });

    return sendSuccess(res, message, 201, "Group message sent");
  } catch (error) {
    console.error("[GROUP_MESSAGE_SEND_ERROR]", error.message);
    return sendError(res, "Failed to send group message", 500);
  }
});

app.put("/api/groups/:groupId/messages/:messageId", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);

  const updatedGroup = hydrateGroupRecord(group);
  const messageIndex = updatedGroup.messages.findIndex((message) => String(message.id) === String(req.params.messageId));
  if (messageIndex < 0) return sendError(res, "Message not found", 404);
  const existingMessage = updatedGroup.messages[messageIndex];
  if (String(existingMessage.senderId) !== String(req.user.id) && !isGroupAdmin(updatedGroup, req.user.id)) {
    return sendError(res, "You cannot edit this message", 403);
  }

  const nextContent = String(req.body?.content || req.body?.text || "").trim();
  updatedGroup.messages[messageIndex] = {
    ...existingMessage,
    content: nextContent,
    text: nextContent,
    body: nextContent,
    edited: true,
    updatedAt: new Date().toISOString(),
  };
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "message_edited", `${req.params.messageId} edited by ${req.user.id}`));
  scheduleDevStatePersist();
  const message = storedGroup.messages.find((item) => String(item.id) === String(req.params.messageId));
  broadcastGroupEvent(storedGroup, ["group:message:edited", "message_edited"], { groupId: storedGroup.id, message });
  return sendSuccess(res, message, 200, "Message edited");
});

app.delete("/api/groups/:groupId/messages/:messageId", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, userId)) return sendError(res, "Access denied", 403);

  const updatedGroup = hydrateGroupRecord(group);
  const messageIndex = updatedGroup.messages.findIndex((message) => String(message.id) === String(req.params.messageId));
  if (messageIndex < 0) return sendError(res, "Message not found", 404);
  const existingMessage = updatedGroup.messages[messageIndex];
  if (String(existingMessage.senderId) !== userId && !isGroupAdmin(updatedGroup, userId)) {
    return sendError(res, "You cannot delete this message", 403);
  }

  updatedGroup.messages[messageIndex] = {
    ...existingMessage,
    content: "This message was deleted",
    text: "This message was deleted",
    body: "This message was deleted",
    mediaUrl: null,
    media_url: null,
    imageUrl: null,
    attachment: null,
    deleted: true,
    deletedForEveryone: true,
    updatedAt: new Date().toISOString(),
  };
  const storedGroup = syncGroupToMemberBuckets(recordGroupTransparency(updatedGroup, "message_deleted", `${req.params.messageId} deleted by ${userId}`));
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, ["group:message:deleted", "message_deleted"], { groupId: storedGroup.id, messageId: req.params.messageId, deletedBy: userId });
  return sendSuccess(res, { groupId: storedGroup.id, messageId: req.params.messageId, deleted: true }, 200, "Message deleted");
});

app.post("/api/groups/:groupId/messages/:messageId/reactions", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const emoji = String(req.body?.reaction || req.body?.emoji || "").trim();
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, userId)) return sendError(res, "Access denied", 403);
  if (!emoji) return sendError(res, "reaction is required", 400);
  if (group.settings?.allowReactions === false) return sendError(res, "Reactions are disabled in this group", 403);

  const updatedGroup = hydrateGroupRecord(group);
  const message = updatedGroup.messages.find((item) => String(item.id) === String(req.params.messageId));
  if (!message) return sendError(res, "Message not found", 404);
  message.reactions = normalizeGroupReactions(message.reactions || {});
  message.reactions[emoji] = uniqueIds([...(message.reactions[emoji] || []), userId]);
  message.updatedAt = new Date().toISOString();
  const storedGroup = syncGroupToMemberBuckets(updatedGroup);
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, "group:reaction", { groupId: storedGroup.id, messageId: message.id, reactions: message.reactions, emoji, userId, action: "added" });
  return sendSuccess(res, { messageId: message.id, reactions: message.reactions, emoji, action: "added" }, 200, "Reaction added");
});

app.delete("/api/groups/:groupId/messages/:messageId/reactions/:reaction", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const emoji = String(req.params.reaction || "").trim();
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, userId)) return sendError(res, "Access denied", 403);
  if (!emoji) return sendError(res, "reaction is required", 400);

  const updatedGroup = hydrateGroupRecord(group);
  const message = updatedGroup.messages.find((item) => String(item.id) === String(req.params.messageId));
  if (!message) return sendError(res, "Message not found", 404);
  message.reactions = normalizeGroupReactions(message.reactions || {});
  message.reactions[emoji] = (message.reactions[emoji] || []).filter((id) => String(id) !== userId);
  if (message.reactions[emoji].length === 0) delete message.reactions[emoji];
  message.updatedAt = new Date().toISOString();
  const storedGroup = syncGroupToMemberBuckets(updatedGroup);
  scheduleDevStatePersist();
  broadcastGroupEvent(storedGroup, "group:reaction", { groupId: storedGroup.id, messageId: message.id, reactions: message.reactions, emoji, userId, action: "removed" });
  return sendSuccess(res, { messageId: message.id, reactions: message.reactions, emoji, action: "removed" }, 200, "Reaction removed");
});

app.post("/api/groups/:groupId/typing", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, userId)) return sendError(res, "Access denied", 403);

  const isTyping = req.body?.typing !== false;
  const updatedGroup = hydrateGroupRecord(group);
  updatedGroup.typingUsers = updatedGroup.typingUsers && typeof updatedGroup.typingUsers === "object" ? updatedGroup.typingUsers : {};
  if (isTyping) updatedGroup.typingUsers[userId] = Date.now();
  else delete updatedGroup.typingUsers[userId];
  syncGroupToMemberBuckets(updatedGroup);
  scheduleDevStatePersist();
  broadcastGroupEvent(updatedGroup, "group:typing", {
    groupId: updatedGroup.id,
    userId,
    isTyping,
    typing: isTyping,
    timestamp: Date.now(),
  }, { exceptUserId: userId });
  return sendSuccess(res, { groupId: updatedGroup.id, userId, isTyping }, 200, "Typing state updated");
});

app.get("/api/groups/:groupId/media", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  return sendSuccess(res, { media: group.media || [], total: (group.media || []).length }, 200, "Group media loaded");
});

app.get("/api/groups/:groupId/search", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  const query = String(req.query.q || req.query.query || "").trim().toLowerCase();
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  const messages = (group.messages || []).filter((message) => (
    !query
      || String(message.content || "").toLowerCase().includes(query)
      || String(message.mediaUrl || "").toLowerCase().includes(query)
      || String(message.fileName || "").toLowerCase().includes(query)
  ));
  return sendSuccess(res, { query, messages, total: messages.length }, 200, "Group search completed");
});

app.get("/api/groups/:groupId/transparency", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  return sendSuccess(res, { logs: group.transparency || [], total: (group.transparency || []).length }, 200, "Transparency log loaded");
});

app.get("/api/groups/:groupId/notes", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  return sendSuccess(res, { notes: [], total: 0 }, 200, "Group notes loaded");
});

app.get("/api/groups/:groupId/events", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  return sendSuccess(res, { events: [], total: 0 }, 200, "Group events loaded");
});

app.post("/api/groups/:groupId/calls", apiLimiter, authMiddleware, (req, res) => {
  const group = findGroupAcrossUsers(req.params.groupId);
  if (!group) return sendError(res, "Group not found", 404);
  if (!isGroupMember(group, req.user.id)) return sendError(res, "Access denied", 403);
  if (group.settings?.allowCalls === false) return sendError(res, "Calls are disabled in this group", 403);

  const payload = {
    callId: `group_call_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    groupId: group.id,
    groupName: group.name,
    callerId: String(req.user.id),
    callerName: getUserProfile(req.user.id)?.displayName || String(req.user.id),
    callType: req.body?.callType || req.body?.type || "voice",
    startedAt: new Date().toISOString(),
  };
  broadcastGroupEvent(group, "group:call-started", payload, { exceptUserId: String(req.user.id) });
  return sendSuccess(res, payload, 201, "Group call started");
});

app.use("/api/calls", apiLimiter, createCallRouter({
  authMiddleware,
  controller: callController,
}));

app.get("/api/messages/chats", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const summaries = chats
    .map((chat) => buildChatSummaryForUser(userId, chat))
    .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
  return sendSuccess(res, summaries, 200, "Chats loaded");
});

app.get("/api/messages/unread-counts", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const counts = {};
  chats.forEach((chat) => {
    const summary = buildChatSummaryForUser(userId, chat);
    counts[String(chat.id)] = summary.unreadCount || 0;
  });
  return sendSuccess(res, counts, 200, "Unread counts loaded");
});

app.get("/api/messages", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chatId = normalizeEntityId(req.query.chatId || req.query.conversationId);
  if (!chatId) {
    return sendError(res, "chatId is required", 400);
  }

  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const chat = chats.find((item) => String(item.id) === chatId) || ensureChatRecord(userId, chatId, [userId]);
  const before = req.query.before ? Date.parse(req.query.before) : null;
  const after = req.query.after ? Date.parse(req.query.after) : null;
  const limit = Math.max(1, Number(req.query.limit || 100));

  let messages = getVisibleChatMessages(chat, userId).map((message) => {
    const seenBy = Array.isArray(message.seenBy) ? message.seenBy.map(String) : [];
    const deliveredTo = Array.isArray(message.deliveredTo) ? message.deliveredTo.map(String) : [];
    return {
      ...message,
      status: seenBy.includes(userId) && String(message.senderId) !== userId
        ? "read"
        : deliveredTo.includes(userId) && String(message.senderId) !== userId
          ? "delivered"
          : (message.status || "sent"),
    };
  });

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
    unread: buildChatSummaryForUser(userId, chat).unreadCount || 0,
  }, 200, "Messages loaded");
});

app.post("/api/messages", apiLimiter, authMiddleware, (req, res) => {
  const { chatId, senderId, receiverId, participantIds } = resolveChatContext(req.user.id, req.body || {});
  const content = String(req.body?.content || "").trim();
  const type = req.body?.type || "text";
  const localId = normalizeEntityId(req.body?.localId);
  const replyToId = normalizeEntityId(req.body?.replyToId || req.body?.replyTo);
  const replyVisibility = req.body?.replyVisibility === "creator_only" ? "creator_only" : "public";

  if (!content && !req.body?.attachment) {
    return sendError(res, "Message content is required", 400);
  }

  const createdAt = new Date().toISOString();
  const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const normalizedParticipants = Array.from(new Set(participantIds.map(String)));
  const recipientIds = normalizedParticipants.filter((participantId) => String(participantId) !== senderId);
  const deliveredTo = [];
  const replyTo = replyToId
    ? (ensureUserBucket(devState.chats, senderId, () => [])
      .flatMap((chat) => chat.messages || [])
      .find((message) => String(message.id) === String(replyToId)) || null)
    : null;

  const message = {
    id: messageId,
    localId,
    serverId: messageId,
    chatId,
    conversationId: chatId,
    senderId,
    receiverId,
    recipientIds,
    content,
    type,
    attachment: req.body?.attachment || null,
    replyToId,
    replyTo: replyTo ? {
      id: replyTo.id,
      messageId: replyTo.id,
      content: replyTo.content,
      type: replyTo.type || "text",
      senderId: replyTo.senderId,
      senderName: getUserProfile(replyTo.senderId)?.displayName || getUserProfile(replyTo.senderId)?.username || String(replyTo.senderId),
    } : null,
    mentions: Array.isArray(req.body?.mentions) ? req.body.mentions : [],
    createdAt,
    updatedAt: createdAt,
    sentAt: createdAt,
    deliveredAt: null,
    readAt: null,
    status: "sent",
    deletedFor: [],
    deletedForEveryone: false,
    deliveredTo,
    seenBy: [senderId],
    batchId: req.body?.batchId || null,
    replyVisibility,
  };

  normalizedParticipants.forEach((participantId) => {
    const chat = ensureChatRecord(participantId, chatId, normalizedParticipants);
    chat.type = normalizedParticipants.length > 2 ? "group" : "direct";
    chat.replyVisibility = replyVisibility;
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    chat.messages.push(cloneMessage(message));
    chat.lastMessage = content;
    chat.lastMessageAt = createdAt;
    chat.updatedAt = createdAt;
    chat.createdAt = chat.createdAt || createdAt;
  });

  scheduleDevStatePersist();
  emitMessageToParticipants(normalizedParticipants, message);

  webSocketService.sendToUser(senderId, "message_sent", {
    messageId,
    localId,
    serverId: messageId,
    chatId,
    createdAt,
    status: "sent",
  });
  webSocketService.sendToUser(senderId, "message:sent", {
    messageId,
    localId,
    serverId: messageId,
    chatId,
    createdAt,
    status: "sent",
  });

  return sendSuccess(res, {
    message,
    chatId,
    conversation: buildChatSummaryForUser(senderId, ensureChatRecord(senderId, chatId, normalizedParticipants)),
    delivered: false,
  }, 201, "Message created");
});

app.delete("/api/messages/:messageId", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const messageId = String(req.params.messageId);
  const forEveryone = req.query.deleteForEveryone === "true"
    || req.query.forEveryone === "true"
    || req.body?.forEveryone === true;

  let targetMessage = null;
  let participantIds = [];
  let chatId = null;

  for (const chats of devState.chats.values()) {
    for (const chat of (chats || [])) {
      const found = (chat.messages || []).find((message) => String(message.id) === messageId);
      if (found) {
        targetMessage = found;
        participantIds = getParticipantIdsForChat(chat.id, chat.participantIds || []);
        chatId = String(chat.id);
        break;
      }
    }
    if (targetMessage) break;
  }

  if (!targetMessage || !chatId) {
    return sendError(res, "Message not found", 404);
  }

  if (forEveryone && String(targetMessage.senderId) !== userId) {
    return sendError(res, "Only the sender can delete for everyone", 403);
  }

  syncChatMessage(chatId, participantIds, (message) => {
    if (String(message.id) !== messageId) return message;
    if (forEveryone) {
      return {
        ...message,
        deletedForEveryone: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "deleted",
      };
    }
    const deletedFor = Array.isArray(message.deletedFor) ? message.deletedFor.map(String) : [];
    if (!deletedFor.includes(userId)) deletedFor.push(userId);
    return {
      ...message,
      deletedFor,
      updatedAt: new Date().toISOString(),
    };
  });

  scheduleDevStatePersist();

  const payload = {
    messageId,
    chatId,
    deletedBy: userId,
    deleteForEveryone: forEveryone,
    timestamp: new Date().toISOString(),
  };

  participantIds.forEach((participantId) => {
    if (!forEveryone && String(participantId) !== userId) return;
    webSocketService.sendToUser(participantId, "message:deleted", payload);
    webSocketService.sendToUser(participantId, "message_deleted", payload);
  });

  return sendSuccess(res, payload, 200, "Message deleted");
});

app.post("/api/messages/mark-delivered/batch", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chatId = normalizeEntityId(req.body?.chatId || req.body?.conversationId);
  const incomingIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds.map(String) : [];
  if (!chatId || incomingIds.length === 0) {
    return sendError(res, "chatId and messageIds are required", 400);
  }

  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const chat = chats.find((item) => String(item.id) === chatId);
  if (!chat) {
    return sendSuccess(res, { chatId, messageIds: [], updated: 0 }, 200, "Nothing to mark as delivered");
  }

  const participantIds = getParticipantIdsForChat(chatId, chat.participantIds || [userId]);
  const deliveredAt = new Date().toISOString();
  const deliveredMessages = [];

  syncChatMessage(chatId, participantIds, (message) => {
    if (!incomingIds.includes(String(message.id))) return message;
    if (String(message.senderId) === userId) return message;

    const deliveredTo = Array.isArray(message.deliveredTo) ? message.deliveredTo.map(String) : [];
    if (!deliveredTo.includes(userId)) deliveredTo.push(userId);

    const seenBy = Array.isArray(message.seenBy) ? message.seenBy.map(String) : [];
    const next = {
      ...message,
      deliveredTo,
      deliveredAt: message.deliveredAt || deliveredAt,
      updatedAt: deliveredAt,
      status: seenBy.includes(userId) ? "read" : "delivered",
    };

    if (!deliveredMessages.some((item) => String(item.id) === String(next.id))) {
      deliveredMessages.push(next);
    }

    return next;
  });

  (devState.messageBatches || []).forEach((batch) => {
    batch.messages = (batch.messages || []).map((message) => {
      if (!incomingIds.includes(String(message.id))) return message;
      return {
        ...message,
        deliveredAt: message.deliveredAt || deliveredAt,
      };
    });
    batch.updatedAt = deliveredAt;
  });

  scheduleDevStatePersist();

  const senderIds = Array.from(new Set(
    deliveredMessages
      .map((message) => String(message.senderId || ""))
      .filter((senderId) => senderId && senderId !== userId)
  ));

  senderIds.forEach((senderId) => {
    const senderMessages = deliveredMessages.filter((message) => String(message.senderId) === senderId);
    const batchPayload = {
      chatId,
      messageIds: senderMessages.map((message) => message.id),
      deliveredTo: [userId],
      deliveredBy: userId,
      deliveredAt,
      status: "delivered",
    };
    webSocketService.sendToUser(senderId, "message:delivered", batchPayload);
    webSocketService.sendToUser(senderId, "message_delivered", batchPayload);

    senderMessages.forEach((message) => {
      const singlePayload = {
        messageId: message.id,
        localId: message.localId || null,
        serverId: message.id,
        chatId,
        deliveredAt,
        deliveredTo: [userId],
        deliveredBy: userId,
        status: "delivered",
      };
      webSocketService.sendToUser(senderId, "message:delivered", singlePayload);
      webSocketService.sendToUser(senderId, "message_delivered", singlePayload);
    });
  });

  return sendSuccess(res, {
    chatId,
    messageIds: deliveredMessages.map((message) => message.id),
    updated: deliveredMessages.length,
    deliveredAt,
  }, 200, "Messages marked as delivered");
});

app.post("/api/messages/mark-read/batch", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const chatId = normalizeEntityId(req.body?.chatId || req.body?.conversationId);
  const incomingIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds.map(String) : [];
  if (!chatId || incomingIds.length === 0) {
    return sendError(res, "chatId and messageIds are required", 400);
  }

  const chats = ensureUserBucket(devState.chats, userId, () => []);
  const chat = chats.find((item) => String(item.id) === chatId);
  if (!chat) {
    return sendSuccess(res, { chatId, messageIds: [], updated: 0 }, 200, "Nothing to mark as read");
  }

  const participantIds = getParticipantIdsForChat(chatId, chat.participantIds || [userId]);
  const readAt = new Date().toISOString();
  const readMessages = [];

  syncChatMessage(chatId, participantIds, (message) => {
    if (!incomingIds.includes(String(message.id))) return message;
    const seenBy = Array.isArray(message.seenBy) ? message.seenBy.map(String) : [];
    if (!seenBy.includes(userId)) seenBy.push(userId);
    const deliveredTo = Array.isArray(message.deliveredTo) ? message.deliveredTo.map(String) : [];
    if (String(message.senderId) !== userId && !deliveredTo.includes(userId)) deliveredTo.push(userId);
    const next = {
      ...message,
      seenBy,
      deliveredTo,
      readAt,
      updatedAt: readAt,
      status: "read",
    };
    if (!readMessages.some((item) => String(item.id) === String(next.id))) {
      readMessages.push(next);
    }
    return next;
  });

  (devState.messageBatches || []).forEach((batch) => {
    batch.messages = (batch.messages || []).map((message) => {
      if (!incomingIds.includes(String(message.id))) return message;
      return {
        ...message,
        deliveredAt: message.deliveredAt || readAt,
        readAt,
      };
    });
    batch.updatedAt = readAt;
  });

  scheduleDevStatePersist();

  const senderIds = Array.from(new Set(
    readMessages
      .map((message) => String(message.senderId || ""))
      .filter((senderId) => senderId && senderId !== userId)
  ));

  senderIds.forEach((senderId) => {
    const senderMessages = readMessages.filter((message) => String(message.senderId) === senderId);
    const batchPayload = {
      chatId,
      messageIds: senderMessages.map((message) => message.id),
      readBy: userId,
      readerId: userId,
      readAt,
      status: "read",
    };
    webSocketService.sendToUser(senderId, "message:read", batchPayload);
    webSocketService.sendToUser(senderId, "message_read", batchPayload);
    webSocketService.sendToUser(senderId, "message_seen", batchPayload);
    senderMessages.forEach((message) => {
      const singlePayload = {
        messageId: message.id,
        localId: message.localId || null,
        serverId: message.id,
        chatId,
        readAt,
        readBy: userId,
        readerId: userId,
        status: "read",
      };
      webSocketService.sendToUser(senderId, "message_read", singlePayload);
      webSocketService.sendToUser(senderId, "message_seen", singlePayload);
    });
  });

  return sendSuccess(res, {
    chatId,
    messageIds: readMessages.map((message) => message.id),
    updated: readMessages.length,
    readAt,
  }, 200, "Messages marked as read");
});

app.post("/api/messages/bulk", apiLimiter, authMiddleware, (req, res) => {
  const senderId = String(req.user.id);
  const content = String(req.body?.content || "").trim();
  const type = req.body?.type || "text";
  const replyVisibility = req.body?.replyVisibility === "creator_only" ? "creator_only" : "public";
  const requestedIds = Array.isArray(req.body?.conversationIds)
    ? req.body.conversationIds.map(String)
    : [];

  if (!content) {
    return sendError(res, "Message content is required", 400);
  }
  if (requestedIds.length === 0) {
    return sendError(res, "conversationIds are required", 400);
  }

  const batchId = `batch_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const createdAt = new Date().toISOString();
  const results = [];
  const recipients = [];

  requestedIds.forEach((requestedChatId) => {
    const senderChats = ensureUserBucket(devState.chats, senderId, () => []);
    const existingChat = senderChats.find((chat) => String(chat.id) === String(requestedChatId));
    const inferredRecipient = existingChat
      ? inferReceiverIdFromChat(senderId, existingChat)
      : (String(requestedChatId).includes("__")
        ? String(requestedChatId).split("__").find((id) => id !== senderId) || null
        : null);

    const context = resolveChatContext(senderId, {
      chatId: requestedChatId,
      receiverId: inferredRecipient,
    });
    const participantIds = Array.from(new Set(context.participantIds.map(String)));
    const recipientId = participantIds.find((participantId) => participantId !== senderId) || inferredRecipient || null;
    const deliveredTo = [];
    const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const message = {
      id: messageId,
      serverId: messageId,
      localId: null,
      chatId: context.chatId,
      conversationId: context.chatId,
      senderId,
      receiverId: recipientId,
      recipientIds: participantIds.filter((participantId) => participantId !== senderId),
      content,
      type,
      attachment: null,
      replyToId: null,
      replyTo: null,
      mentions: [],
      createdAt,
      updatedAt: createdAt,
      sentAt: createdAt,
      deliveredAt: null,
      readAt: null,
      status: "sent",
      deletedFor: [],
      deletedForEveryone: false,
      deliveredTo,
      seenBy: [senderId],
      batchId,
      replyVisibility,
    };

    participantIds.forEach((participantId) => {
      const chat = ensureChatRecord(participantId, context.chatId, participantIds);
      chat.type = "direct";
      chat.replyVisibility = replyVisibility;
      chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
      chat.messages.push(cloneMessage(message));
      chat.lastMessage = content;
      chat.lastMessageAt = createdAt;
      chat.updatedAt = createdAt;
      chat.createdAt = chat.createdAt || createdAt;
    });

    if (recipientId) {
      recipients.push({
        chatId: context.chatId,
        userId: recipientId,
        delivered: false,
        seen: false,
      });
    }
    results.push(message);
    emitMessageToParticipants(participantIds, message);
  });

  devState.messageBatches.unshift({
    id: batchId,
    senderId,
    recipientIds: recipients.map((item) => item.userId),
    replyVisibility,
    content,
    type,
    createdAt,
    updatedAt: createdAt,
    messages: results.map((message) => ({
      id: message.id,
      chatId: message.chatId,
      receiverId: message.receiverId,
      deliveredAt: message.deliveredAt,
      readAt: null,
    })),
  });
  scheduleDevStatePersist();

  return sendSuccess(res, {
    batchId,
    replyVisibility,
    messages: results,
    recipients,
    deliveryCount: recipients.filter((item) => item.delivered).length,
    seenCount: 0,
  }, 201, "Bulk messages sent");
});

app.get("/api/messages/bulk/history", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const history = (devState.messageBatches || [])
    .filter((batch) => String(batch.senderId) === userId)
    .map((batch) => ({
      id: batch.id,
      batchId: batch.id,
      senderId: batch.senderId,
      recipientIds: batch.recipientIds || [],
      replyVisibility: batch.replyVisibility || "public",
      content: batch.content || "",
      type: batch.type || "text",
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt || batch.createdAt,
      deliveryCount: (batch.messages || []).filter((message) => !!message.deliveredAt).length,
      seenCount: (batch.messages || []).filter((message) => !!message.readAt).length,
      recipients: (batch.messages || []).map((message) => {
        const profile = getUserProfile(message.receiverId) || ensureSeedUser(message.receiverId);
        return {
          chatId: message.chatId,
          userId: String(message.receiverId),
          displayName: profile.displayName || profile.username || String(message.receiverId),
          username: profile.username || String(message.receiverId),
          avatar: profile.avatar || null,
          deliveredAt: message.deliveredAt || null,
          readAt: message.readAt || null,
        };
      }),
    }));
  return sendSuccess(res, history, 200, "Bulk history loaded");
});

app.get("/api/messages/bulk/history/:batchId", apiLimiter, authMiddleware, (req, res) => {
  const userId = String(req.user.id);
  const batch = (devState.messageBatches || []).find((item) => String(item.id) === String(req.params.batchId));
  if (!batch || String(batch.senderId) !== userId) {
    return sendError(res, "Bulk history not found", 404);
  }
  const detail = {
    id: batch.id,
    batchId: batch.id,
    senderId: batch.senderId,
    replyVisibility: batch.replyVisibility || "public",
    content: batch.content || "",
    type: batch.type || "text",
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt || batch.createdAt,
    recipients: (batch.messages || []).map((message) => {
      const profile = getUserProfile(message.receiverId) || ensureSeedUser(message.receiverId);
      return {
        chatId: message.chatId,
        userId: String(message.receiverId),
        displayName: profile.displayName || profile.username || String(message.receiverId),
        username: profile.username || String(message.receiverId),
        avatar: profile.avatar || null,
        deliveredAt: message.deliveredAt || null,
        readAt: message.readAt || null,
      };
    }),
  };
  return sendSuccess(res, detail, 200, "Bulk history detail loaded");
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

["SIGINT", "SIGTERM"].forEach((signalName) => {
  process.on(signalName, () => {
    persistDevStateNow();
    process.exit(0);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
