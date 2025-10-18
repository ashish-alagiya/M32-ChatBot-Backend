import { Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { FlightPlanner, FlightSearchParams } from "../utils/flightPlanner.utils.js";
import ChatSession from "../models/chatSession.model.js";
import Message from "../models/message.model.js";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { AgentRouterService } from "../services/agentRouter.service.js";

export class ChatController {
  private client: GoogleGenAI;
  private flightPlanner: FlightPlanner;
  private agentRouter: AgentRouterService;
  private sessionAgents: Map<string, AgentRouterService>; 

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.flightPlanner = new FlightPlanner();
    this.agentRouter = new AgentRouterService();
    this.sessionAgents = new Map();
  }

  generateResponse = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { prompt, sessionId, isNewChat = false } = req.body;
      const userId = req.user?.userId;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "Prompt is required and must be a non-empty string",
          data: {
            prompt: "",
            response: "",
            metadata: {},
            isNewChat: false
          }
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      let chatSession;
      let isNewSession = false;

      if (sessionId) {
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
          res.status(400).json({
            success: false,
            message: "Invalid session ID format"
          });
          return;
        }

        chatSession = await ChatSession.findById(sessionId);
        if (!chatSession) {
          res.status(404).json({
            success: false,
            message: "Chat session not found"
          });
          return;
        }

        if (chatSession.userId.toString() !== userId) {
          res.status(403).json({
            success: false,
            message: "Unauthorized access to this chat session"
          });
          return;
        }
      } else {
        const title = await this.generateSessionTitle(prompt);
        chatSession = await ChatSession.create({
          userId: userId,
          title: title
        });
        isNewSession = true;
      }

      const sessionIdObj = chatSession._id as mongoose.Types.ObjectId;
      const sessionIdStr = sessionIdObj.toString();
      if (!this.sessionAgents.has(sessionIdStr) || isNewChat) {
        this.sessionAgents.set(sessionIdStr, new AgentRouterService(sessionIdObj));
      }
      
      const sessionAgent = this.sessionAgents.get(sessionIdStr)!;
      
      if (isNewChat) {
        sessionAgent.clearHistory();
      }

      const result = await sessionAgent.chat(prompt);

      console.log('=== MESSAGE STORAGE DEBUG ===');
      console.log('Message Type:', result.metadata.type);
      console.log('Agent:', result.metadata.agent);
      
      try {
        console.log('Attempting to store user message...');
        const userMessage = await Message.create({
          chat_session_id: chatSession._id as mongoose.Types.ObjectId,
          is_user_message: true,
          message: prompt
        });
        console.log('User message stored:', userMessage._id);

        console.log('Attempting to store AI response...');
        const aiMessage = await Message.create({
          chat_session_id: chatSession._id,
          is_user_message: false,
          message: result.response
        });
        console.log('AI response stored:', aiMessage._id);

        const messageCount = await Message.countDocuments({ chat_session_id: chatSession._id });
        if (isNewSession || messageCount % 6 === 0) { 
          console.log('Updating session title based on conversation...');
          await this.updateSessionTitle(chatSession._id as mongoose.Types.ObjectId, userId);
        }
      } catch (messageError) {
        console.error('ERROR STORING MESSAGES:', messageError);
        throw messageError;
      }

      res.status(200).json({
        success: true,
        message: "Response generated successfully",
        data: {
          sessionId: chatSession._id,
          isNewSession: isNewSession,
          prompt: prompt,
          response: result.response,
          flightData: result.flightData,
          context: result.context,
          metadata: result.metadata,
          timestamp: new Date().toISOString(),
          isNewChat: isNewChat
        }
      });

    } catch (error) {
      console.error("Chat generation error:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("API_KEY_INVALID")) {
          res.status(401).json({
            success: false,
            message: "Invalid API key",
            error: "Please check your GEMINI_API_KEY environment variable"
          });
          return;
        }
        
        if (error.message.includes("QUOTA_EXCEEDED")) {
          res.status(429).json({
            success: false,
            message: "API quota exceeded",
            error: "Please try again later"
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        message: "Failed to generate response",
        error: process.env.NODE_ENV === "development" ? (error as Error).message : "Internal server error",
        data: {
          prompt: req.body.prompt || "",
          response: "",
          metadata: {},
          isNewChat: false
        }
      });
    }
  };

  private async generateSessionTitle(prompt: string): Promise<string> {
    try {
      const titlePrompt = `Based on this user message, generate a short, concise title (max 50 characters) that summarizes the conversation topic. Only return the title, nothing else.

User message: "${prompt}"

Title:`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: titlePrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      let title = response.text?.trim() || "New Chat";
      
      title = title.replace(/^["']|["']$/g, '');
      
      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }

      return title;
    } catch (error: any) {
      if (error?.status === 429 || error?.message?.includes('quota') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Gemini API quota exceeded - using default title');
      } else {
        console.error("Error generating session title:", error?.message || error);
      }
      return "New Chat";
    }
  }

  private async updateSessionTitle(sessionId: mongoose.Types.ObjectId, userId: string): Promise<void> {
    try {
      const session = await ChatSession.findOne({ _id: sessionId, userId: userId });
      if (!session) {
        console.error('Session not found or unauthorized');
        return;
      }

      const recentMessages = await Message.find({ chat_session_id: sessionId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('message is_user_message');

      if (recentMessages.length === 0) {
        return;
      }

      recentMessages.reverse();

      const conversationContext = recentMessages
        .map(msg => `${msg.is_user_message ? 'User' : 'Assistant'}: ${msg.message}`)
        .join('\n');

      const titlePrompt = `Based on this conversation, generate a short, concise title (max 50 characters) that best summarizes the main topic or purpose of this chat. Only return the title, nothing else.

Conversation:
${conversationContext}

Title:`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: titlePrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      let newTitle = response.text?.trim() || session.title;
      
      newTitle = newTitle.replace(/^["']|["']$/g, '');
      
      if (newTitle.length > 50) {
        newTitle = newTitle.substring(0, 47) + '...';
      }

      await ChatSession.updateOne(
        { _id: sessionId },
        { $set: { title: newTitle, updatedAt: new Date() } }
      );

      console.log(`Session title updated: "${session.title}" → "${newTitle}"`);
    } catch (error: any) {
      if (error?.status === 429 || error?.message?.includes('quota') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Gemini API quota exceeded - skipping session title update');
      } else {
        console.error("Error updating session title:", error?.message || error);
      }
    }
  }

  getAllSessions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      const sessions = await ChatSession.find({ userId: userId })
        .sort({ updatedAt: -1 })
        .select('-__v');

      const sessionsWithCount = await Promise.all(
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
        message: "Sessions retrieved successfully",
        data: {
          totalSessions: sessionsWithCount.length,
          sessions: sessionsWithCount
        }
      });

    } catch (error) {
      console.error("Get all sessions error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve sessions",
        error: process.env.NODE_ENV === "development" ? (error as Error).message : "Internal server error"
      });
    }
  };

  getSessionMessages = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({
          success: false,
          message: "Valid session ID is required"
        });
        return;
      }

      const session = await ChatSession.findById(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          message: "Chat session not found"
        });
        return;
      }

      if (session.userId.toString() !== userId) {
        res.status(403).json({
          success: false,
          message: "Unauthorized access to this chat session"
        });
        return;
      }

      const messages = await Message.find({ chat_session_id: sessionId })
        .sort({ createdAt: -1 })
        .select('-__v');

      res.status(200).json({
        success: true,
        message: "Messages retrieved successfully",
        data: {
          sessionId: sessionId,
          sessionTitle: session.title,
          messageCount: messages.length,
          messages: messages.map(msg => ({
            id: msg._id,
            isUserMessage: msg.is_user_message,
            message: msg.message,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt
          }))
        }
      });

    } catch (error) {
      console.error("Get session messages error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve messages",
        error: process.env.NODE_ENV === "development" ? (error as Error).message : "Internal server error"
      });
    }
  };
}
