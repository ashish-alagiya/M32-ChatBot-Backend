import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import User from "../models/user.model.js";

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    username: string;
  };
}

// Verify JWT Token Middleware
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "No token provided. Authorization denied.",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const jwtSecret = config.jwtSecret;

    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };

    // Get user from database
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found. Authorization denied.",
      });
      return;
    }

    // Attach user to request object
    req.user = {
      userId: (user._id as any).toString(),
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error: any) {
    console.error("Authentication error:", error);

    if (error.name === "JsonWebTokenError") {
      res.status(401).json({
        success: false,
        message: "Invalid token. Authorization denied.",
      });
      return;
    }

    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error authenticating user",
      error: error.message,
    });
  }
};

