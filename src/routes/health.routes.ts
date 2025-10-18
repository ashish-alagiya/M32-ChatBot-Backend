import { Router } from "express";
import { HealthController } from "../controllers/health.controller.js";

const router = Router();
const healthController = new HealthController();

router.get("/health/full", healthController.fullHealthCheck);

export default router;
