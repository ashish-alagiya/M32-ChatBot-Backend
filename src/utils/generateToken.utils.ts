import config from "../config";
import jwt from "jsonwebtoken";

const generateToken = (userId: string, email: string): string => {
    const jwtSecret = config.jwtSecret;
  
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }
  
    return jwt.sign({ userId, email }, jwtSecret, {
      expiresIn: (config.jwtExpiresIn || "7d") as any,
    });
  };

export default generateToken;