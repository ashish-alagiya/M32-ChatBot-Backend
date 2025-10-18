import { FlightAgentService } from "./flightAgent.service.js";
import { PersonalAgentService } from "./personalAgent.service.js";
import SessionContext from "../models/sessionContext.model.js";
import mongoose from "mongoose";

export interface ChatResponse {
  response: string;
  context?: any;
  contextUpdates?: Map<string, any>;
  flightData?: any;
  metadata: {
    agent: string;
    type: string;
    confidence: number;
    routing: {
      selectedAgent: string;
      confidence: number;
      allScores: Array<{ agent: string; confidence: number }>;
    };
    processingTime: number;
    [key: string]: any;
  };
}

export class AgentRouterService {
  private flightAgent: FlightAgentService;
  private personalAgent: PersonalAgentService;
  private conversationHistory: Array<{ role: string; message: string }>;
  private sessionId?: mongoose.Types.ObjectId;

  constructor(sessionId?: mongoose.Types.ObjectId) {
    this.flightAgent = new FlightAgentService();
    this.personalAgent = new PersonalAgentService();
    this.conversationHistory = [];
    this.sessionId = sessionId;
  }

  async chat(message: string): Promise<ChatResponse> {
    const startTime = Date.now();

    let existingContext: Map<string, any> | undefined;
    if (this.sessionId) {
      existingContext = await this.loadSessionContext();
    }

    let flightScore = this.calculateFlightConfidence(message);
    const personalScore = this.calculatePersonalConfidence(message);

    const isInFlightConversation = this.isOngoingFlightConversation();
    
    if (isInFlightConversation) {
      console.log('🛫 Continuing flight conversation - boosting flight score');
      flightScore = Math.max(flightScore, 0.7);
    }

    const flightThreshold = 0.3;

    console.log(`Agent Routing - Flight: ${flightScore.toFixed(2)}, Personal: ${personalScore.toFixed(2)}, InFlightConvo: ${isInFlightConversation}`);

    if (flightScore >= flightThreshold && flightScore > personalScore) {
      this.conversationHistory.push({ role: 'user', message });
      
      const result = await this.flightAgent.processFlightQuery(message, this.conversationHistory);

      this.conversationHistory.push({ role: 'assistant', message: result.message });

      return {
        response: result.message,
        context: this.personalAgent.getUserContext(),
        flightData: result.flightData,
        metadata: {
          agent: "Flight Assistant",
          type: "flight",
          confidence: flightScore,
          routing: {
            selectedAgent: "Flight Assistant",
            confidence: flightScore,
            allScores: [
              { agent: "Flight Assistant", confidence: flightScore },
              { agent: "Personal Assistant", confidence: personalScore },
            ],
          },
          tripType: result.tripType,
          requiresMoreInfo: result.requiresMoreInfo,
          suggestedQuestions: result.suggestedQuestions,
          searchParams: result.searchParams,
          processingTime: Date.now() - startTime,
        },
      };
    } else {
      this.conversationHistory.push({ role: 'user', message });
      
      const result = await this.personalAgent.processMessage(message, existingContext);

      this.conversationHistory.push({ role: 'assistant', message: result.message });

      if (this.sessionId && result.contextUpdates && result.contextUpdates.size > 0) {
        await this.saveSessionContext(result.contextUpdates);
      }

      return {
        response: result.message,
        context: this.personalAgent.getUserContext(),
        contextUpdates: result.contextUpdates,
        metadata: {
          agent: "Personal Assistant",
          type: "personal",
          confidence: personalScore,
          routing: {
            selectedAgent: "Personal Assistant",
            confidence: personalScore,
            allScores: [
              { agent: "Flight Assistant", confidence: flightScore },
              { agent: "Personal Assistant", confidence: personalScore },
            ],
          },
          contextExtracted: result.contextExtracted,
          suggestedFollowUps: result.suggestedFollowUps,
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  private async loadSessionContext(): Promise<Map<string, any> | undefined> {
    try {
      if (!this.sessionId) return undefined;

      const sessionContext = await SessionContext.findOne({ chat_session_id: this.sessionId });
      if (!sessionContext) return undefined;

      return sessionContext.contextData;
    } catch (error) {
      console.error("Error loading session context:", error);
      return undefined;
    }
  }

  private async saveSessionContext(contextUpdates: Map<string, any>): Promise<void> {
    try {
      if (!this.sessionId) return;

      const existingContext = await SessionContext.findOne({ chat_session_id: this.sessionId });

      if (existingContext) {
        contextUpdates.forEach((value, key) => {
          existingContext.contextData.set(key, value);
        });
        await existingContext.save();
      } else {
        await SessionContext.create({
          chat_session_id: this.sessionId,
          contextData: contextUpdates
        });
      }

      console.log(`Context saved for session ${this.sessionId}`);
    } catch (error) {
      console.error("Error saving session context:", error);
    }
  }

  private calculateFlightConfidence(message: string): number {
    const lowerMessage = message.toLowerCase();
    
    const flightKeywords = [
      { keywords: ['flight', 'flights', 'fly', 'flying'], weight: 0.4 },
      { keywords: ['airport', 'departure', 'arrival', 'layover', 'stopover'], weight: 0.35 },
      { keywords: ['ticket', 'booking', 'book', 'reserve'], weight: 0.3 },
      { keywords: ['airline', 'airways', 'air india', 'indigo', 'spicejet'], weight: 0.35 },
      { keywords: ['round trip', 'one way', 'return flight', 'direct flight'], weight: 0.4 },
      { keywords: ['travel', 'trip', 'journey'], weight: 0.2 },
      { keywords: ['destination', 'going to', 'want to go'], weight: 0.25 },
    ];

    const cityPatterns = [
      /\b(mumbai|delhi|bangalore|goa|chennai|kolkata|hyderabad)\b/i,
      /\b(from|to)\s+[A-Z][a-z]+/,
      /\b[A-Z]{3}\b/, 
    ];

    const datePatterns = [
      /\b(tomorrow|today|next week|next month)\b/i,
      /\d{1,2}[-\/]\d{1,2}[-\/]?\d{0,4}/,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    ];

    let score = 0;

    for (const group of flightKeywords) {
      for (const keyword of group.keywords) {
        if (lowerMessage.includes(keyword)) {
          score += group.weight;
          break;
        }
      }
    }

    for (const pattern of cityPatterns) {
      if (pattern.test(message)) {
        score += 0.3;
        break;
      }
    }

    for (const pattern of datePatterns) {
      if (pattern.test(message)) {
        score += 0.2;
        break;
      }
    }

    if (/how (much|expensive|cheap)|price|cost|fare/i.test(message)) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  private calculatePersonalConfidence(message: string): number {
    const lowerMessage = message.toLowerCase();
    
    const personalKeywords = [
      { keywords: ['hello', 'hi', 'hey', 'greetings'], weight: 0.5 },
      { keywords: ['how are you', 'what\'s up', 'sup'], weight: 0.5 },
      { keywords: ['help', 'assist', 'support'], weight: 0.3 },
      { keywords: ['thank', 'thanks', 'appreciate'], weight: 0.4 },
      { keywords: ['who are you', 'what can you do', 'your name'], weight: 0.5 },
      { keywords: ['tell me about', 'explain', 'what is'], weight: 0.3 },
    ];

    const personalInfoPatterns = [
      { patterns: ['my name is', 'i am', 'i\'m', 'call me'], weight: 0.7 },
      { patterns: ['my age is', 'i am', 'years old'], weight: 0.6 },
      { patterns: ['i live in', 'i\'m from', 'from'], weight: 0.6 },
      { patterns: ['i work as', 'i am a', 'my job'], weight: 0.6 },
      { patterns: ['my email', 'my phone', 'my number'], weight: 0.6 },
    ];

    const personalInfoQueries = [
      { patterns: ['what is my name', 'what\'s my name', 'my name'], weight: 0.6 },
      { patterns: ['who am i', 'what do you know about me'], weight: 0.6 },
      { patterns: ['where am i from', 'where do i live'], weight: 0.6 },
      { patterns: ['how old am i', 'what is my age'], weight: 0.6 },
      { patterns: ['what do i do', 'my job', 'my work'], weight: 0.5 },
    ];

    let score = 0;

    for (const group of personalInfoPatterns) {
      for (const pattern of group.patterns) {
        if (lowerMessage.includes(pattern)) {
          score += group.weight;
          break;
        }
      }
    }

    for (const group of personalInfoQueries) {
      for (const pattern of group.patterns) {
        if (lowerMessage.includes(pattern)) {
          score += group.weight;
          break;
        }
      }
    }

    for (const group of personalKeywords) {
      for (const keyword of group.keywords) {
        if (lowerMessage.includes(keyword)) {
          score += group.weight;
          break;
        }
      }
    }

    if (message.trim().split(' ').length <= 3 && !/flight|fly|book/i.test(message)) {
      score += 0.3;
    }

    if (message.includes('?') && !/flight|fly|book|airport/i.test(message)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private isOngoingFlightConversation(): boolean {
    if (this.conversationHistory.length < 2) {
      return false;
    }

    const recentMessages = this.conversationHistory.slice(-4);
    const recentText = recentMessages.map(m => m.message.toLowerCase()).join(' ');

    const flightKeywords = [
      'flight', 'fly', 'airport', 'departure', 'arrival', 'destination',
      'return date', 'one-way', 'round-trip', 'booking', 'travel date',
      'when would you like', 'where are you flying', 'provide a date',
      'need to know', 'departure date', 'which date'
    ];
    
    const hasFlightKeywords = flightKeywords.some(keyword => recentText.includes(keyword));

    const aiAskedForFlightInfo = recentMessages.some(m => 
      m.role === 'assistant' && (
        m.message.toLowerCase().includes('date') ||
        m.message.toLowerCase().includes('when') ||
        m.message.toLowerCase().includes('where') ||
        m.message.toLowerCase().includes('destination') ||
        m.message.toLowerCase().includes('return')
      )
    );

    return hasFlightKeywords || aiAskedForFlightInfo;
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.personalAgent.clearContext();
    this.flightAgent.clearContext();
  }

  getHistory(): Array<{ role: string; message: string }> {
    return [...this.conversationHistory];
  }
}

