import { GoogleGenAI } from "@google/genai";

export interface PersonalAgentResponse {
  message: string;
  contextExtracted?: any;
  contextUpdates?: Map<string, any>;
  suggestedFollowUps?: string[];
}

export class PersonalAgentService {
  private client: GoogleGenAI;
  private userContext: Map<string, any>;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.userContext = new Map();
  }

  async processMessage(message: string, existingContext?: Map<string, any>): Promise<PersonalAgentResponse> {
    try {
      if (existingContext) {
        existingContext.forEach((value, key) => {
          this.userContext.set(key, value);
        });
      }

      const contextExtracted = await this.extractContextWithPersonalInfo(message);
      
      const contextUpdates = new Map<string, any>();
      if (contextExtracted.personalInfo) {
        Object.entries(contextExtracted.personalInfo).forEach(([key, value]) => {
          if (value) {
            this.userContext.set(key, value);
            contextUpdates.set(key, value);
          }
        });
      }

      const contextString = this.buildContextString();

      const promptWithContext = contextString 
        ? `Context about the user:\n${contextString}\n\nUser message: ${message}\n\nRespond naturally, using the context when relevant.`
        : message;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptWithContext,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      const aiMessage = response.text || "I'm here to help! How can I assist you today?";

      const followUps = await this.generateFollowUps(message, aiMessage);

      return {
        message: aiMessage,
        contextExtracted: contextExtracted,
        contextUpdates: contextUpdates,
        suggestedFollowUps: followUps
      };

    } catch (error) {
      console.error("Personal agent error:", error);
      return {
        message: "I'm here to help! How can I assist you today?",
        suggestedFollowUps: [
          "Tell me about yourself",
          "What can you help me with?",
          "Search for flights"
        ]
      };
    }
  }

  private buildContextString(): string {
    if (this.userContext.size === 0) return "";
    
    const contextParts: string[] = [];
    
    this.userContext.forEach((value, key) => {
      if (value && value !== '') {
        contextParts.push(`- ${key}: ${value}`);
      }
    });
    
    return contextParts.join('\n');
  }

  private async extractContextWithPersonalInfo(message: string): Promise<any> {
    try {
      const contextPrompt = `Analyze this message and extract information: "${message}"

Extract:
1. **Personal Information** (if mentioned):
   - name: (if user says "my name is X" or "I'm X" or "call me X")
   - age: (if mentioned)
   - location: (city/country if mentioned as "I'm from X" or "I live in X")
   - occupation: (if mentioned)
   - email: (if provided)
   - phone: (if provided)
   - Any other personal details

2. **General Context**:
   - Main topic/intent
   - Sentiment (positive/neutral/negative)
   - User's apparent goal

Respond in JSON format:
{
  "personalInfo": {
    "name": "...",
    "age": "...",
    "location": "...",
    "occupation": "...",
    // any other fields found
  },
  "topic": "...",
  "intent": "...",
  "sentiment": "..."
}

If no personal info is found, leave personalInfo fields as null.`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contextPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      try {
        const contextText = response.text || '{}';
        const jsonMatch = contextText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error("Context parsing error:", parseError);
      }

      return {
        personalInfo: {},
        topic: "general",
        intent: "conversation",
        sentiment: "neutral"
      };

    } catch (error) {
      console.error("Context extraction error:", error);
      return { personalInfo: {} };
    }
  }

  private async generateFollowUps(userMessage: string, botResponse: string): Promise<string[]> {
    try {
      const followUpPrompt = `Based on this conversation:
User: "${userMessage}"
Bot: "${botResponse}"

Suggest 3 brief, natural follow-up questions the user might want to ask next. 
Each should be a complete question, max 10 words.
Respond with just the 3 questions, one per line.`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: followUpPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      const text = response.text || '';
      const questions = text.split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0 && q.length < 100)
        .slice(0, 3);

      return questions.length > 0 ? questions : [
        "Can you tell me more?",
        "What else should I know?",
        "How can you help me?"
      ];

    } catch (error) {
      console.error("Follow-up generation error:", error);
      return [
        "Tell me more",
        "What else?",
        "How can you help?"
      ];
    }
  }

  getUserContext(): any {
    return Object.fromEntries(this.userContext);
  }

  updateContext(key: string, value: any): void {
    this.userContext.set(key, value);
  }

  clearContext(): void {
    this.userContext.clear();
  }
}

