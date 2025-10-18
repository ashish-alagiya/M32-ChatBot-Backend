import { Router } from "express";
import { ChatController } from "../controllers/chat.controller.js";

const router = Router();
const chatController = new ChatController();

router.post("/generate", chatController.generateResponse);

export default router;
