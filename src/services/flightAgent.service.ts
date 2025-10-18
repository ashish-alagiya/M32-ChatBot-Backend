import { GoogleGenAI } from "@google/genai";
import { FlightPlanner, FlightSearchParams } from "../utils/flightPlanner.utils.js";

export interface FlightAgentResponse {
  message: string;
  flightData?: any;
  searchParams?: any;
  tripType?: string;
  requiresMoreInfo?: boolean;
  suggestedQuestions?: string[];
}

export class FlightAgentService {
  private client: GoogleGenAI;
  private flightPlanner: FlightPlanner;
  private conversationContext: Partial<FlightSearchParams>;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.flightPlanner = new FlightPlanner();
    this.conversationContext = {};
  }

  async processFlightQuery(message: string, conversationHistory?: Array<{ role: string; message: string }>): Promise<FlightAgentResponse> {
    try {
      let fullContext = message;
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-4);
        const historyText = recentHistory.map(h => `${h.role}: ${h.message}`).join('\n');
        fullContext = `Previous conversation:\n${historyText}\n\nCurrent message: ${message}`;
      }

      const currentParams = this.flightPlanner.extractFlightParams(message);
      
      const extractedParams = this.mergeFlightParams(currentParams, this.conversationContext);
      
      if (currentParams) {
        this.conversationContext = { ...this.conversationContext, ...currentParams };
      }

      if (!extractedParams) {
        const clarificationMessage = await this.getAIFlightHelp(message);
        
        return {
          message: clarificationMessage,
          requiresMoreInfo: true,
          suggestedQuestions: [
            "Where would you like to fly from?",
            "What's your destination?",
            "When would you like to travel?"
          ]
        };
      }

      const missingInfo: string[] = [];
      if (!extractedParams.departureId) missingInfo.push('departure city/airport');
      if (!extractedParams.arrivalId) missingInfo.push('arrival city/airport');
      if (!extractedParams.outboundDate) missingInfo.push('departure date');

      if (missingInfo.length > 0) {
        const contextualResponse = await this.getContextualClarification(message, extractedParams, missingInfo);
        
        return {
          message: contextualResponse,
          searchParams: extractedParams,
          requiresMoreInfo: true
        };
      }

      const tripType = extractedParams.returnDate ? "round-trip" : "one-way";

      const searchResult = await this.flightPlanner.searchFlights(extractedParams as FlightSearchParams);

      if (!searchResult.success) {
        const errorMessage = await this.handleFlightSearchError(
          message,
          extractedParams,
          searchResult.error || 'Unknown error',
          tripType
        );

        return {
          message: errorMessage,
          searchParams: extractedParams,
          tripType: tripType,
          requiresMoreInfo: true
        };
      }

      if (!searchResult.data?.flights || searchResult.data.flights.length === 0) {
        return {
          message: `I searched for flights from ${extractedParams.departureId} to ${extractedParams.arrivalId} on ${extractedParams.outboundDate}${extractedParams.returnDate ? ` returning ${extractedParams.returnDate}` : ''}, but no flights were available. You may want to try different dates or nearby airports.`,
          searchParams: extractedParams,
          tripType: tripType,
          flightData: { flights: [], totalResults: 0 }
        };
      }

      const flightSummary = this.formatFlightResults(searchResult.data.flights);
      const aiResponse = await this.generateFlightResponse(message, flightSummary, extractedParams, tripType);

      return {
        message: aiResponse,
        flightData: {
          flights: searchResult.data.flights,
          searchParams: extractedParams,
          totalResults: searchResult.data.flights.length,
          tripType: tripType,
          googleFlightsUrl: searchResult.data.googleFlightsUrl
        },
        searchParams: extractedParams,
        tripType: tripType,
        requiresMoreInfo: false
      };

    } catch (error) {
      console.error("Flight agent error:", error);
      return {
        message: "I encountered an error while searching for flights. Please try again or rephrase your request.",
        requiresMoreInfo: false
      };
    }
  }

  private async getAIFlightHelp(userPrompt: string): Promise<string> {
    try {
      const aiPrompt = `The user said: "${userPrompt}"

This seems like they want to search for flights, but I need more information. 

Provide a friendly, conversational response that:
1. Acknowledges what they said
2. Asks for the missing information (departure city, arrival city, dates)
3. Gives a helpful example
4. Keeps it brief and encouraging

Be natural and friendly!`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      return response.text || "I'd love to help you find flights! Could you tell me where you'd like to fly from, where to, and when?";
    } catch (error) {
      console.error("AI flight help error:", error);
      return "I'd love to help you find flights! Could you tell me:\n- Where you're flying from\n- Your destination\n- Your travel dates";
    }
  }

  private async getContextualClarification(
    userPrompt: string,
    extractedInfo: Partial<FlightSearchParams>,
    missingInfo: string[]
  ): Promise<string> {
    try {
      const extractedDetails = [];
      if (extractedInfo.departureId) extractedDetails.push(`From: ${extractedInfo.departureId}`);
      if (extractedInfo.arrivalId) extractedDetails.push(`To: ${extractedInfo.arrivalId}`);
      if (extractedInfo.outboundDate) extractedDetails.push(`Departure: ${extractedInfo.outboundDate}`);
      if (extractedInfo.returnDate) extractedDetails.push(`Return: ${extractedInfo.returnDate}`);

      const aiPrompt = `User said: "${userPrompt}"

I understood these details:
${extractedDetails.join('\n')}

But I still need: ${missingInfo.join(', ')}

Provide a friendly, conversational response that:
1. Confirms what I understood
2. Asks for the missing information naturally
3. Keeps it brief and helpful

Be encouraging and natural!`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      return response.text || `Great! I got some details, but I still need ${missingInfo.join(' and ')}. Could you provide that?`;
    } catch (error) {
      console.error("Contextual clarification error:", error);
      return `I need a bit more information: ${missingInfo.join(' and ')}. Could you provide that?`;
    }
  }

  private async handleFlightSearchError(
    userPrompt: string,
    searchParams: Partial<FlightSearchParams>,
    apiError: string,
    tripType: string
  ): Promise<string> {
    try {
      const searchDetails = [];
      if (searchParams.departureId) searchDetails.push(`From: ${searchParams.departureId}`);
      if (searchParams.arrivalId) searchDetails.push(`To: ${searchParams.arrivalId}`);
      if (searchParams.outboundDate) searchDetails.push(`Departure: ${searchParams.outboundDate}`);
      if (searchParams.returnDate) searchDetails.push(`Return: ${searchParams.returnDate}`);

      const aiPrompt = `A user asked: "${userPrompt}"

I tried to search for ${tripType} flights with these details:
${searchDetails.join('\n')}

But the flight search API returned this error: "${apiError}"

Provide a friendly response that:
1. Acknowledges their request positively
2. Explains what went wrong simply
3. Suggests what they can try (different dates, route, etc.)
4. Stays encouraging and helpful

Keep it conversational!`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      return response.text || `I had trouble finding flights. Try different dates or nearby airports?`;
    } catch (error) {
      console.error("Error handling failed:", error);
      return "I encountered an issue with the flight search. Could you try different dates or airports?";
    }
  }

  private formatFlightResults(flights: any[]): string {
    return flights.slice(0, 5).map((flight, index) => {
      const price = flight.price?.amount ? `$${flight.price.amount}` : 'Price N/A';
      const duration = flight.duration ? `${flight.duration} min` : 'Duration N/A';
      const stops = flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop(s)`;
      
      return `Flight ${index + 1}: ${flight.airline} - ${price}, ${duration}, ${stops}`;
    }).join('\n');
  }

  private async generateFlightResponse(
    userPrompt: string,
    flightSummary: string,
    searchParams: Partial<FlightSearchParams>,
    tripType: string
  ): Promise<string> {
    try {
      const aiPrompt = `User asked: "${userPrompt}"

Here are the ${tripType} flight options found:

${flightSummary}

Search: ${searchParams.departureId} → ${searchParams.arrivalId}
Departure: ${searchParams.outboundDate}${searchParams.returnDate ? `\nReturn: ${searchParams.returnDate}` : ' (One-way)'}

Provide a helpful, concise summary with:
1. Best value options
2. Quickest options
3. Any notable differences
4. Practical booking advice

Keep it friendly and actionable!`;

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      return response.text || flightSummary;
    } catch (error) {
      console.error("Generate response error:", error);
      return flightSummary;
    }
  }

  private mergeFlightParams(
    currentParams: Partial<FlightSearchParams> | null,
    contextParams: Partial<FlightSearchParams>
  ): Partial<FlightSearchParams> | null {
    if (!currentParams && Object.keys(contextParams).length === 0) {
      return null;
    }

    const merged: Partial<FlightSearchParams> = { ...contextParams };

    if (currentParams) {
      if (currentParams.departureId) merged.departureId = currentParams.departureId;
      if (currentParams.arrivalId) merged.arrivalId = currentParams.arrivalId;
      if (currentParams.outboundDate) merged.outboundDate = currentParams.outboundDate;
      if (currentParams.returnDate) merged.returnDate = currentParams.returnDate;
      if (currentParams.currency) merged.currency = currentParams.currency;
      if (currentParams.hl) merged.hl = currentParams.hl;
    }

    if (!merged.departureId && !merged.arrivalId && !merged.outboundDate) {
      return null;
    }

    return merged;
  }

  clearContext(): void {
    this.conversationContext = {};
  }
}

