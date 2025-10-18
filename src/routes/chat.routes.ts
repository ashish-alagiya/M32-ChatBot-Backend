import { Router } from "express";
import { ChatController } from "../controllers/chat.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();
const chatController = new ChatController();

router.post("/generate", authenticate, chatController.generateResponse);

router.get("/sessions", authenticate, chatController.getAllSessions);

router.get("/session/:sessionId/messages", authenticate, chatController.getSessionMessages);

export default router;
