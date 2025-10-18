import { Router } from "express";
import { register, login } from "../controllers/auth.controller.js";

const router = Router();

// POST /api/auth/register - Register new user
router.post("/register", register);

// POST /api/auth/login - Login user
router.post("/login", login);

export default router;

