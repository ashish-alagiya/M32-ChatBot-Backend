import { Router } from "express";
import { getProfile } from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/profile", authenticate, getProfile);

export default router;

