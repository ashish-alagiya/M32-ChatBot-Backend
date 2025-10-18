import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { FlightPlanner, FlightSearchParams } from "../utils/flightPlanner.utils.js";

export class ChatController {
  private client: GoogleGenAI;
  private flightPlanner: FlightPlanner;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.flightPlanner = new FlightPlanner();
  }

  generateResponse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { prompt } = req.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "Prompt is required and must be a non-empty string"
        });
        return;
      }

      // Check if this is a flight planning request
      const isFlightRequest = this.isFlightPlanningRequest(prompt);
      
      if (isFlightRequest) {
        await this.handleFlightPlanning(prompt, res);
        return;
      }

      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      const text = response.text || "I apologize, but I couldn't generate a response.";

      res.status(200).json({
        success: true,
        message: "Response generated successfully",
        data: {
          prompt: prompt,
          response: text,
          timestamp: new Date().toISOString()
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
        error: process.env.NODE_ENV === "development" ? (error as Error).message : "Internal server error"
      });
    }
  };

  private isFlightPlanningRequest(prompt: string): boolean {
    const flightKeywords = [
      'flight', 'flights', 'fly', 'flying', 'airline', 'airport',
      'departure', 'arrival', 'destination', 'travel', 'trip',
      'book flight', 'find flight', 'search flight', 'flight search'
    ];
    
    const lowerPrompt = prompt.toLowerCase();
    return flightKeywords.some(keyword => lowerPrompt.includes(keyword));
  }

  private async handleFlightPlanning(prompt: string, res: Response): Promise<void> {
    try {
      // Extract flight parameters from the prompt
      const flightParams = this.flightPlanner.extractFlightParams(prompt);
      
      if (!flightParams) {
        // If we can't extract flight parameters, ask for clarification
        const clarificationPrompt = `I can help you find flights! Please provide:
- Departure airport code (e.g., PEK for Beijing)
- Arrival airport code (e.g., AUS for Austin)
- Departure date (YYYY-MM-DD format)
- Return date (optional, YYYY-MM-DD format)
- Currency (optional, e.g., USD, EUR)

Example: "Find flights from PEK to AUS on 2025-10-18 returning 2025-10-24"`;

        const response = await this.client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: clarificationPrompt,
          config: {
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        res.status(200).json({
          success: true,
          message: "Flight planning assistance",
          data: {
            prompt: prompt,
            response: response.text || "I can help you find flights! Please provide the required information.",
            timestamp: new Date().toISOString(),
            type: "flight_clarification"
          }
        });
        return;
      }

      // Search for flights
      const flightResult = await this.flightPlanner.searchFlights(flightParams as FlightSearchParams);
      
      if (!flightResult.success) {
        res.status(500).json({
          success: false,
          message: "Failed to search flights",
          error: flightResult.error
        });
        return;
      }

      // Format flight results
      const flightSummary = this.formatFlightResults(flightResult.data!.flights);
      
      // Generate AI response about the flights
      const aiPrompt = `Based on these flight search results, provide a helpful summary and recommendations:

${flightSummary}

Search parameters: ${JSON.stringify(flightResult.data!.searchParams, null, 2)}`;

      const aiResponse = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Flight search completed",
        data: {
          prompt: prompt,
          response: aiResponse.text || flightSummary,
          timestamp: new Date().toISOString(),
          type: "flight_search",
          flightData: flightResult.data
        }
      });

    } catch (error) {
      console.error("Flight planning error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process flight planning request",
        error: process.env.NODE_ENV === "development" ? (error as Error).message : "Internal server error"
      });
    }
  }

  private formatFlightResults(flights: any[]): string {
    if (flights.length === 0) {
      return "No flights found for the specified criteria.";
    }

    let summary = `Found ${flights.length} flight option(s):\n\n`;
    
    flights.slice(0, 5).forEach((flight, index) => {
      summary += `${index + 1}. ${flight.airline}\n`;
      summary += `   Departure: ${flight.departure.airport} at ${flight.departure.time} on ${flight.departure.date}\n`;
      summary += `   Arrival: ${flight.arrival.airport} at ${flight.arrival.time} on ${flight.arrival.date}\n`;
      summary += `   Duration: ${flight.duration}\n`;
      summary += `   Price: ${flight.price.currency} ${flight.price.amount}\n`;
      summary += `   Stops: ${flight.stops}\n`;
      if (flight.bookingLink) {
        summary += `   Book: ${flight.bookingLink}\n`;
      }
      summary += `\n`;
    });

    return summary;
  }
}
