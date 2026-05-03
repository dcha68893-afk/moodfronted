function isoNow() {
  return new Date().toISOString();
}

function normalizeUserId(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function cloneCall(call) {
  return call ? JSON.parse(JSON.stringify(call)) : null;
}

export function createCallService({ state, webSocketService }) {
  if (!state.callRecords) state.callRecords = new Map();
  if (!state.idempotencyKeys) state.idempotencyKeys = new Map();
  if (!state.callTimeouts) state.callTimeouts = new Map();

  function ensureUserCalls(userId) {
    if (!state.calls.has(userId)) state.calls.set(userId, []);
    return state.calls.get(userId);
  }

  function storeCallForUser(userId, call) {
    const calls = ensureUserCalls(userId);
    const existingIndex = calls.findIndex((item) => String(item.id) === String(call.id));
    if (existingIndex >= 0) {
      calls[existingIndex] = cloneCall(call);
    } else {
      calls.unshift(cloneCall(call));
    }
  }

  function persistCall(call) {
    state.callRecords.set(String(call.id), cloneCall(call));
    const participantIds = [call.callerId, ...(call.participantIds || [])]
      .filter(Boolean)
      .map(String);

    participantIds.forEach((userId) => storeCallForUser(userId, call));
    return cloneCall(call);
  }

  function clearCallTimeout(callId) {
    const timer = state.callTimeouts.get(String(callId));
    if (timer) {
      clearTimeout(timer);
      state.callTimeouts.delete(String(callId));
    }
  }

  function scheduleCallTimeout(call) {
    clearCallTimeout(call.id);
    const timeoutMs = 3 * 60 * 1000;
    const timer = setTimeout(() => {
      const current = state.callRecords.get(String(call.id));
      if (!current || current.status !== "ringing") return;

      const timedOutCall = {
        ...current,
        status: "missed",
        timeoutAt: isoNow(),
        endedAt: isoNow(),
        reason: "timeout",
        updatedAt: isoNow(),
      };

      persistCall(timedOutCall);
      state.callTimeouts.delete(String(call.id));

      [timedOutCall.callerId, ...(timedOutCall.participantIds || [])]
        .filter(Boolean)
        .forEach((userId) => {
          emitCallEvent(userId, ["call:timeout", "call_timeout"], timedOutCall);
          emitCallEvent(userId, ["call:ended", "call_ended"], timedOutCall);
        });
    }, timeoutMs);

    state.callTimeouts.set(String(call.id), timer);
  }

  function getCall(callId) {
    return cloneCall(state.callRecords.get(String(callId)) || null);
  }

  function buildCallPayload(call) {
    const receiverId = call.participantIds?.[0] || null;
    return {
      callId: call.id,
      id: call.id,
      callerId: call.callerId,
      receiverId,
      participantIds: call.participantIds || [],
      callType: call.callType,
      status: call.status,
      callerName: call.callerName || null,
      callerAvatar: call.callerAvatar || null,
      calleeId: receiverId,
      timestamp: Date.now(),
    };
  }

  function emitCallEvent(targetUserId, events, call) {
    events.forEach((eventName) => {
      webSocketService.sendToUser(targetUserId, eventName, buildCallPayload(call));
    });
  }

  function getHistoryForUser(userId) {
    return ensureUserCalls(String(userId)).map(cloneCall);
  }

  function createOrReuseCall({ caller, body = {} }) {
    const callerId = normalizeUserId(caller?.id);
    const directReceiverId = normalizeUserId(body.receiverId || body.userId);
    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map(normalizeUserId).filter(Boolean)
      : (directReceiverId ? [directReceiverId] : []);

    if (!callerId || participantIds.length === 0) {
      return { error: "Missing call participant" };
    }

    const idempotencyKey = body.clientRequestId || body.requestId || body.idempotencyKey || null;
    if (idempotencyKey) {
      const existingCallId = state.idempotencyKeys.get(`${callerId}:${idempotencyKey}`);
      if (existingCallId) {
        const existingCall = getCall(existingCallId);
        if (existingCall) {
          return {
            call: existingCall,
            reused: true,
            receiverOnline: participantIds.some((userId) => webSocketService.isUserOnline(userId)),
          };
        }
      }
    }

    const createdCall = {
      id: body.callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      callType: body.callType || body.type || "audio",
      status: "ringing",
      callerId,
      callerName: caller.displayName || caller.username || caller.email || `User ${callerId}`,
      callerAvatar: caller.avatar || null,
      participantIds,
      createdAt: isoNow(),
      updatedAt: isoNow(),
      metadata: body.metadata || {},
      clientRequestId: idempotencyKey || null,
    };

    persistCall(createdCall);
    scheduleCallTimeout(createdCall);

    if (idempotencyKey) {
      state.idempotencyKeys.set(`${callerId}:${idempotencyKey}`, createdCall.id);
    }

    participantIds.forEach((userId) => {
      emitCallEvent(userId, ["call:incoming", "incoming_call"], createdCall);
    });

    return {
      call: createdCall,
      reused: false,
      receiverOnline: participantIds.some((userId) => webSocketService.isUserOnline(userId)),
    };
  }

  function updateCall(callId, updater) {
    const existingCall = state.callRecords.get(String(callId));
    if (!existingCall) return null;
    const updatedCall = {
      ...existingCall,
      ...updater(existingCall),
      updatedAt: isoNow(),
    };
    persistCall(updatedCall);
    return updatedCall;
  }

  function answerCall(callId, user) {
    clearCallTimeout(callId);
    const updatedCall = updateCall(callId, () => ({
      status: "accepted",
      answeredBy: normalizeUserId(user?.id),
      answeredAt: isoNow(),
    }));

    if (!updatedCall) return null;

    emitCallEvent(updatedCall.callerId, ["call:answered", "call_accepted"], updatedCall);
    updatedCall.participantIds.forEach((userId) => {
      emitCallEvent(userId, ["call:answered", "call_accepted"], updatedCall);
    });

    return updatedCall;
  }

  function rejectCall(callId, user, reason = "rejected") {
    clearCallTimeout(callId);
    const updatedCall = updateCall(callId, () => ({
      status: "rejected",
      rejectedBy: normalizeUserId(user?.id),
      rejectedAt: isoNow(),
      reason,
    }));

    if (!updatedCall) return null;

    emitCallEvent(updatedCall.callerId, ["call:rejected", "call_rejected"], updatedCall);
    updatedCall.participantIds.forEach((userId) => {
      emitCallEvent(userId, ["call:rejected", "call_rejected"], updatedCall);
    });

    return updatedCall;
  }

  function cancelCall(callId, user) {
    clearCallTimeout(callId);
    const updatedCall = updateCall(callId, () => ({
      status: "cancelled",
      cancelledBy: normalizeUserId(user?.id),
      cancelledAt: isoNow(),
    }));

    if (!updatedCall) return null;

    [updatedCall.callerId, ...(updatedCall.participantIds || [])].forEach((userId) => {
      emitCallEvent(userId, ["call:cancelled", "call_cancelled"], updatedCall);
    });

    return updatedCall;
  }

  function endCall(callId, user, body = {}) {
    clearCallTimeout(callId);
    const updatedCall = updateCall(callId, () => ({
      status: body.status || "ended",
      endedBy: normalizeUserId(body.endedBy || user?.id),
      endedAt: isoNow(),
      duration: Number(body.duration || 0),
    }));

    if (!updatedCall) return null;

    [updatedCall.callerId, ...(updatedCall.participantIds || [])].forEach((userId) => {
      emitCallEvent(userId, ["call:ended"], updatedCall);
    });

    return updatedCall;
  }

  function addParticipant(callId, inviter, targetUserId, extra = {}) {
    const normalizedTargetUserId = normalizeUserId(targetUserId);
    if (!normalizedTargetUserId) return null;

    const updatedCall = updateCall(callId, (existingCall) => {
      const participantIds = Array.from(
        new Set([...(existingCall.participantIds || []).map(String), normalizedTargetUserId])
      );

      return {
        participantIds,
        invitedBy: normalizeUserId(inviter?.id),
        invitedAt: isoNow(),
      };
    });

    if (!updatedCall) return null;

    if (updatedCall.status === "ringing" || updatedCall.status === "accepted") {
      emitCallEvent(normalizedTargetUserId, ["call:incoming", "incoming_call"], updatedCall);
    }

    return updatedCall;
  }

  return {
    getCall,
    getHistoryForUser,
    createOrReuseCall,
    answerCall,
    rejectCall,
    cancelCall,
    endCall,
    addParticipant,
  };
}
