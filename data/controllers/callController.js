function sendSuccess(res, data, message = "OK", status = 200) {
  return res.status(status).json({
    success: true,
    data,
    message,
  });
}

function sendError(res, message, status = 500, data = null) {
  return res.status(status).json({
    success: false,
    data,
    message,
  });
}

export function createCallController(callService) {
  return {
    history(req, res) {
      const calls = callService.getHistoryForUser(req.user.id);
      return sendSuccess(res, { calls }, "Call history loaded");
    },

    create(req, res) {
      const result = callService.createOrReuseCall({ caller: req.user, body: req.body || {} });
      if (result.error) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        {
          call: result.call,
          callId: result.call.id,
          receiverOnline: result.receiverOnline,
          reused: result.reused,
        },
        result.reused ? "Call request reused" : "Call started",
        result.reused ? 200 : 201
      );
    },

    answer(req, res) {
      const call = callService.answerCall(req.params.callId, req.user);
      if (!call) {
        return sendError(res, "Call not found", 404);
      }
      return sendSuccess(res, { call }, "Call accepted");
    },

    reject(req, res) {
      const call = callService.rejectCall(req.params.callId, req.user, req.body?.reason || "rejected");
      if (!call) {
        return sendError(res, "Call not found", 404);
      }
      return sendSuccess(res, { call }, "Call rejected");
    },

    cancel(req, res) {
      const call = callService.cancelCall(req.params.callId, req.user);
      if (!call) {
        return sendError(res, "Call not found", 404);
      }
      return sendSuccess(res, { call }, "Call cancelled");
    },

    end(req, res) {
      const call = callService.endCall(req.params.callId, req.user, req.body || {});
      if (!call) {
        return sendError(res, "Call not found", 404);
      }
      return sendSuccess(res, { call }, "Call ended");
    },
  };
}
