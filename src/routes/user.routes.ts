import { Router } from "express";
import { getProfile } from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/user/profile - Get current user profile (protected)
router.get("/profile", authenticate, getProfile);

export default router;

