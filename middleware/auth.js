import crypto from "crypto";

function decodeBase64Url(input) {
  return Buffer.from(String(input || ""), "base64url").toString("utf8");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return req.query?.token ? String(req.query.token).trim() : null;
}

export function verifyJwtToken(token, secret) {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = String(token || "").split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return { valid: false, message: "Malformed token" };
    }

    const header = safeJsonParse(decodeBase64Url(encodedHeader));
    const payload = safeJsonParse(decodeBase64Url(encodedPayload));

    if (!header || !payload || header.alg !== "HS256") {
      return { valid: false, message: "Unsupported token" };
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    if (expectedSignature !== encodedSignature) {
      return { valid: false, message: "Invalid token signature" };
    }

    if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
      return { valid: false, message: "Token expired" };
    }

    return { valid: true, payload };
  } catch (error) {
    return {
      valid: false,
      message: error?.message || "Token verification failed",
    };
  }
}

export function createAuthMiddleware({ secret, getUserById }) {
  return function authMiddleware(req, res, next) {
    const token = extractBearerToken(req);
    console.log("[AUTH] Token received", token ? "yes" : "no");

    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const verification = verifyJwtToken(token, secret);
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        data: null,
        message: verification.message || "Unauthorized",
      });
    }

    const payload = verification.payload || {};
    const userId = payload.userId || payload.id || payload.sub || null;
    const user = userId ? getUserById(String(userId)) : null;

    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    req.token = token;
    req.auth = payload;
    req.user = user;
    return next();
  };
}
