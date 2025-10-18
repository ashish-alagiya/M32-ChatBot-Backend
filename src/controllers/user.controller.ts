import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.js";
import User from "../models/user.model.js";
import ChatSession from "../models/chatSession.model.js";
import Message from "../models/message.model.js";

export const getProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const userId = req.user.userId;

    const user = await User.findById(userId).select("-password");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const sessions = await ChatSession.find({ userId: userId })
      .sort({ updatedAt: -1 }) 
      .select('-__v');

    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session) => {
        const messageCount = await Message.countDocuments({ 
          chat_session_id: session._id 
        });

        const lastMessage = await Message.findOne({ 
          chat_session_id: session._id 
        })
          .sort({ createdAt: -1 })
          .select('message createdAt is_user_message');

        return {
          sessionId: session._id,
          title: session.title,
          messageCount: messageCount,
          lastMessage: lastMessage ? {
            text: lastMessage.message.substring(0, 100) + (lastMessage.message.length > 100 ? '...' : ''),
            isUserMessage: lastMessage.is_user_message,
            timestamp: lastMessage.createdAt
          } : null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: {
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        sessions: {
          totalSessions: sessionsWithDetails.length,
          list: sessionsWithDetails
        }
      },
    });
  } catch (error: any) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user profile",
      error: error.message,
    });
  }
};

