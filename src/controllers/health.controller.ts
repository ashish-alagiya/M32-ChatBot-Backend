import { Request, Response } from "express";
import { testConnection, getDatabaseStats, getConnectionStatus } from "../utils/database.utils.js";

export class HealthController {
  constructor() {}

  fullHealthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const isDbHealthy = await testConnection();
      const dbStatus = getConnectionStatus();

      const response: any = {
        success: isDbHealthy,
        timestamp: new Date().toISOString(),
        server: {
          status: "healthy",
          uptime: `${Math.floor(uptime / 60)} minutes`,
          memory: {
            used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
            total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          },
        },
        database: {
          status: dbStatus,
          healthy: isDbHealthy,
        },
      };

      if (isDbHealthy) {
        const stats = await getDatabaseStats();
        response.database.name = stats.database;
        response.database.collections = stats.collections;
      }

      const statusCode = isDbHealthy ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Full health check failed",
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  };
}
