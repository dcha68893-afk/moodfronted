import express from "express";

export function createCallRouter({ authMiddleware, controller }) {
  const router = express.Router();

  router.use(authMiddleware);
  router.get("/history", controller.history);
  router.post("/", controller.create);
  router.post("/start", controller.create);
  router.post("/:callId/answer", controller.answer);
  router.post("/:callId/reject", controller.reject);
  router.post("/:callId/cancel", controller.cancel);
  router.post("/:callId/end", controller.end);

  return router;
}
