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

interface ConversationState {
  currentIntent: 'flight' | 'personal' | 'unknown';
  flightContext: {
    hasDeparture: boolean;
    hasArrival: boolean;
    hasDate: boolean;
    hasReturnDate: boolean;
    lastAskedFor: string[];
  };
  personalContext: {
    hasName: boolean;
    hasLocation: boolean;
    hasOccupation: boolean;
  };
}

export class AgentRouterService {
  private flightAgent: FlightAgentService;
  private personalAgent: PersonalAgentService;
  private conversationHistory: Array<{ role: string; message: string }>;
  private sessionId?: mongoose.Types.ObjectId;
  private conversationState: ConversationState;

  constructor(sessionId?: mongoose.Types.ObjectId) {
    this.flightAgent = new FlightAgentService();
    this.personalAgent = new PersonalAgentService();
    this.conversationHistory = [];
    this.sessionId = sessionId;
    this.conversationState = {
      currentIntent: 'unknown',
      flightContext: {
        hasDeparture: false,
        hasArrival: false,
        hasDate: false,
        hasReturnDate: false,
        lastAskedFor: []
      },
      personalContext: {
        hasName: false,
        hasLocation: false,
        hasOccupation: false
      }
    };
  }

  async chat(message: string): Promise<ChatResponse> {
    const startTime = Date.now();

    // Load context
    let existingContext: Map<string, any> | undefined;
    if (this.sessionId) {
      existingContext = await this.loadSessionContext();
    }

    // Calculate scores
    let flightScore = this.calculateFlightConfidence(message);
    let personalScore = this.calculatePersonalConfidence(message);

    // Check conversation state
    const isInFlightConversation = this.isOngoingFlightConversation();
    const isInPersonalConversation = this.isOngoingPersonalConversation();
    
    // Apply context boosts
    if (isInFlightConversation) {
      console.log('🛫 Continuing flight conversation - boosting flight score');
      flightScore = Math.max(flightScore, 0.7);
    }
    
    if (isInPersonalConversation) {
      console.log('👤 Continuing personal conversation - boosting personal score');
      personalScore = Math.max(personalScore, 0.6);
    }

    // Dynamic threshold
    const flightThreshold = this.getDynamicThreshold(flightScore, personalScore);

    console.log(`Agent Routing - Flight: ${flightScore.toFixed(2)}, Personal: ${personalScore.toFixed(2)}, InFlightConvo: ${isInFlightConversation}, InPersonalConvo: ${isInPersonalConversation}`);

    // Route to appropriate agent
    if (flightScore >= flightThreshold && flightScore > personalScore) {
      return await this.handleFlightQuery(message, existingContext, startTime, flightScore, personalScore);
    } else {
      return await this.handlePersonalQuery(message, existingContext, startTime, flightScore, personalScore);
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
    
    // Base keywords with weights
    const flightKeywords = [
      { keywords: ['flight', 'flights', 'fly', 'flying'], weight: 0.4 },
      { keywords: ['airport', 'departure', 'arrival', 'layover', 'stopover'], weight: 0.35 },
      { keywords: ['ticket', 'booking', 'book', 'reserve'], weight: 0.3 },
      { keywords: ['airline', 'airways', 'air india', 'indigo', 'spicejet'], weight: 0.35 },
      { keywords: ['round trip', 'one way', 'return flight', 'direct flight'], weight: 0.4 },
      { keywords: ['travel', 'trip', 'journey'], weight: 0.3 },
      { keywords: ['destination', 'going to', 'want to go'], weight: 0.25 },
      { keywords: ['from', 'to', 'departure', 'arrival'], weight: 0.2 },
    ];

    let score = 0;

    // Calculate base score
    for (const group of flightKeywords) {
      for (const keyword of group.keywords) {
        if (lowerMessage.includes(keyword)) {
          score += group.weight;
          break;
        }
      }
    }

    // Context-based scoring
    const contextMultipliers = {
      hasCities: this.hasCityMentions(message) ? 1.3 : 1.0,
      hasDates: this.hasDateMentions(message) ? 1.2 : 1.0,
      hasTravelIntent: this.hasTravelIntent(message) ? 1.4 : 1.0,
      isQuestion: message.includes('?') ? 1.1 : 1.0,
      hasUrgency: this.hasUrgencyWords(message) ? 1.2 : 1.0
    };

    // Apply context multipliers
    score *= Object.values(contextMultipliers).reduce((a, b) => a * b, 1);

    // Penalty for non-flight keywords
    const nonFlightKeywords = ['train', 'bus', 'car', 'drive', 'walk'];
    if (nonFlightKeywords.some(keyword => lowerMessage.includes(keyword))) {
      score *= 0.7;
    }

    if (/show|find|search|look|check|available|availability/i.test(message)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private hasCityMentions(message: string): boolean {
    const cityPattern = /\b(mumbai|delhi|bangalore|goa|chennai|kolkata|hyderabad|surat|pune|ahmedabad|jaipur|lucknow|kochi|cochin|thiruvananthapuram|trivandrum|chandigarh|coimbatore|vadodara|baroda|indore|nagpur|visakhapatnam|bhubaneswar|patna|ranchi|udaipur|amritsar|srinagar|guwahati|imphal|agartala|varanasi)\b/i;
    return cityPattern.test(message);
  }

  private hasDateMentions(message: string): boolean {
    const datePatterns = [
      /\d{1,2}[-\/]\d{1,2}[-\/]?\d{0,4}/,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
      /\b(tomorrow|today|next week|next month)\b/i
    ];
    return datePatterns.some(pattern => pattern.test(message));
  }

  private hasTravelIntent(message: string): boolean {
    const travelIntentPatterns = [
      /want to go/i,
      /planning to/i,
      /need to/i,
      /looking for/i,
      /search for/i,
      /find flights/i
    ];
    return travelIntentPatterns.some(pattern => pattern.test(message));
  }

  private hasUrgencyWords(message: string): boolean {
    const urgencyWords = ['urgent', 'asap', 'immediately', 'quickly', 'fast', 'soon'];
    return urgencyWords.some(word => message.toLowerCase().includes(word));
  }

  private calculatePersonalConfidence(message: string): number {
    const lowerMessage = message.toLowerCase();
    
    // Enhanced personal keywords with better patterns
    const personalKeywords = [
      { 
        keywords: ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'], 
        weight: 0.5 
      },
      { 
        keywords: ['how are you', 'what\'s up', 'sup', 'how do you do'], 
        weight: 0.5 
      },
      { 
        keywords: ['help', 'assist', 'support', 'can you help'], 
        weight: 0.3 
      },
      { 
        keywords: ['thank', 'thanks', 'appreciate', 'grateful'], 
        weight: 0.4 
      },
      { 
        keywords: ['who are you', 'what can you do', 'your name', 'what are you'], 
        weight: 0.5 
      },
      { 
        keywords: ['tell me about', 'explain', 'what is', 'describe'], 
        weight: 0.3 
      },
    ];

    // Enhanced personal info patterns
    const personalInfoPatterns = [
      { patterns: ['my name is', 'i am', 'i\'m', 'call me', 'i\'m called'], weight: 0.7 },
      { patterns: ['my age is', 'i am', 'years old', 'i\'m', 'aged'], weight: 0.6 },
      { patterns: ['i live in', 'i\'m from', 'from', 'i reside in', 'i stay in'], weight: 0.6 },
      { patterns: ['i work as', 'i am a', 'my job', 'i do', 'i\'m employed as'], weight: 0.6 },
      { patterns: ['my email', 'my phone', 'my number', 'contact me at'], weight: 0.6 },
    ];

    // Personal info queries
    const personalInfoQueries = [
      { patterns: ['what is my name', 'what\'s my name', 'my name', 'do you know my name'], weight: 0.6 },
      { patterns: ['who am i', 'what do you know about me', 'tell me about myself'], weight: 0.6 },
      { patterns: ['where am i from', 'where do i live', 'my location'], weight: 0.6 },
      { patterns: ['how old am i', 'what is my age', 'my age'], weight: 0.6 },
      { patterns: ['what do i do', 'my job', 'my work', 'my occupation'], weight: 0.5 },
    ];

    let score = 0;

    // Calculate scores with better matching
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

    // Context-based scoring
    if (message.trim().split(' ').length <= 3 && !/flight|fly|book/i.test(message)) {
      score += 0.3;
    }

    if (message.includes('?') && !/flight|fly|book|airport/i.test(message)) {
      score += 0.2;
    }

    // Penalty for flight keywords in personal context
    if (/flight|fly|book|airport|departure|arrival/i.test(message)) {
      score *= 0.8;
    }

    return Math.min(score, 1.0);
  }

  private isOngoingFlightConversation(): boolean {
    if (this.conversationHistory.length < 2) {
      return false;
    }

    // Check last 6 messages instead of 4
    const recentMessages = this.conversationHistory.slice(-6);
    const recentText = recentMessages.map(m => m.message.toLowerCase()).join(' ');

    // Enhanced flight context detection
    const flightContextKeywords = [
      'flight', 'fly', 'airport', 'departure', 'arrival', 'destination',
      'return date', 'one-way', 'round-trip', 'booking', 'travel date',
      'when would you like', 'where are you flying', 'provide a date',
      'need to know', 'departure date', 'which date', 'searching for',
      'found flights', 'flight options', 'book a flight', 'flight details'
    ];
    
    const hasFlightKeywords = flightContextKeywords.some(keyword => 
      recentText.includes(keyword)
    );

    // Check if AI was asking for flight info
    const aiAskedForFlightInfo = recentMessages.some(m => 
      m.role === 'assistant' && (
        m.message.toLowerCase().includes('departure') ||
        m.message.toLowerCase().includes('arrival') ||
        m.message.toLowerCase().includes('date') ||
        m.message.toLowerCase().includes('when') ||
        m.message.toLowerCase().includes('where') ||
        m.message.toLowerCase().includes('destination') ||
        m.message.toLowerCase().includes('return') ||
        m.message.toLowerCase().includes('flight')
      )
    );

    // Check if user provided flight-related info
    const userProvidedFlightInfo = recentMessages.some(m => 
      m.role === 'user' && (
        m.message.toLowerCase().includes('from') ||
        m.message.toLowerCase().includes('to') ||
        /\d{1,2}[-\/]\d{1,2}/.test(m.message) ||
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(m.message)
      )
    );

    return hasFlightKeywords || aiAskedForFlightInfo || userProvidedFlightInfo;
  }

  private isOngoingPersonalConversation(): boolean {
    if (this.conversationHistory.length < 2) {
      return false;
    }

    const recentMessages = this.conversationHistory.slice(-4);
    const recentText = recentMessages.map(m => m.message.toLowerCase()).join(' ');

    const personalContextKeywords = [
      'hello', 'hi', 'hey', 'how are you', 'what\'s up',
      'my name', 'i am', 'i\'m', 'tell me about', 'who are you',
      'help', 'assist', 'support', 'thank', 'thanks'
    ];
    
    const hasPersonalKeywords = personalContextKeywords.some(keyword => 
      recentText.includes(keyword)
    );

    const aiAskedPersonalInfo = recentMessages.some(m => 
      m.role === 'assistant' && (
        m.message.toLowerCase().includes('your name') ||
        m.message.toLowerCase().includes('tell me about yourself') ||
        m.message.toLowerCase().includes('how can i help') ||
        m.message.toLowerCase().includes('personal')
      )
    );

    return hasPersonalKeywords || aiAskedPersonalInfo;
  }

  private getDynamicThreshold(flightScore: number, personalScore: number): number {
    const baseThreshold = 0.3;
    
    // If scores are very close, be more strict
    const scoreDifference = Math.abs(flightScore - personalScore);
    if (scoreDifference < 0.1) {
      return 0.5; // Higher threshold for close scores
    }
    
    // If one score is significantly higher, be more lenient
    if (scoreDifference > 0.3) {
      return 0.25; // Lower threshold for clear winner
    }
    
    return baseThreshold;
  }

  private async handleFlightQuery(message: string, existingContext: Map<string, any> | undefined, startTime: number, flightScore: number, personalScore: number): Promise<ChatResponse> {
    this.conversationHistory.push({ role: 'user', message });
    this.updateConversationState(message, 'flight');
    
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
  }

  private async handlePersonalQuery(message: string, existingContext: Map<string, any> | undefined, startTime: number, flightScore: number, personalScore: number): Promise<ChatResponse> {
    this.conversationHistory.push({ role: 'user', message });
    this.updateConversationState(message, 'personal');
    
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

  private updateConversationState(message: string, agentType: string): void {
    if (agentType === 'flight') {
      this.conversationState.currentIntent = 'flight';
      // Update flight context based on message content
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('from') || lowerMessage.includes('departure')) {
        this.conversationState.flightContext.hasDeparture = true;
      }
      if (lowerMessage.includes('to') || lowerMessage.includes('arrival')) {
        this.conversationState.flightContext.hasArrival = true;
      }
      if (/\d{1,2}[-\/]\d{1,2}/.test(message) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(message)) {
        this.conversationState.flightContext.hasDate = true;
      }
    } else if (agentType === 'personal') {
      this.conversationState.currentIntent = 'personal';
      // Update personal context based on message content
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('my name is') || lowerMessage.includes('i am') || lowerMessage.includes('i\'m')) {
        this.conversationState.personalContext.hasName = true;
      }
      if (lowerMessage.includes('i live in') || lowerMessage.includes('i\'m from')) {
        this.conversationState.personalContext.hasLocation = true;
      }
      if (lowerMessage.includes('i work as') || lowerMessage.includes('my job')) {
        this.conversationState.personalContext.hasOccupation = true;
      }
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.personalAgent.clearContext();
    this.flightAgent.clearContext();
    this.conversationState = {
      currentIntent: 'unknown',
      flightContext: {
        hasDeparture: false,
        hasArrival: false,
        hasDate: false,
        hasReturnDate: false,
        lastAskedFor: []
      },
      personalContext: {
        hasName: false,
        hasLocation: false,
        hasOccupation: false
      }
    };
  }

  getHistory(): Array<{ role: string; message: string }> {
    return [...this.conversationHistory];
  }
}

