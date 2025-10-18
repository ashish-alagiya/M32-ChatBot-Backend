import { Router } from "express";
import { HealthController } from "../controllers/health.controller.js";

const router = Router();
const healthController = new HealthController();

router.get("/", healthController.fullHealthCheck);

export default router;
