import axios from 'axios';

export interface FlightSearchParams {
  departureId: string;
  arrivalId: string;
  outboundDate: string;
  returnDate?: string;
  currency?: string;
  hl?: string;
}

export interface FlightOption {
  airline: string;
  departure: {
    airport: string;
    time: string;
    date: string;
  };
  arrival: {
    airport: string;
    time: string;
    date: string;
  };
  duration: string;
  price: {
    amount: number;
    currency: string;
  };
  stops: number;
  bookingLink?: string;
}

export interface FlightSearchResult {
  success: boolean;
  data?: {
    flights: FlightOption[];
    searchParams: FlightSearchParams;
  };
  error?: string;
}

export class FlightPlanner {
  private apiKey: string;
  private baseUrl: string = 'https://serpapi.com/search.json';

  constructor() {
    this.apiKey = process.env.SERP_API_KEY || '';
    console.log("api===",this.apiKey)
    if (!this.apiKey) {
      throw new Error('SERP_API_KEY environment variable is required');
    }
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
    try {
      const searchParams: any = {
        engine: 'google_flights',
        departure_id: params.departureId,
        arrival_id: params.arrivalId,
        outbound_date: params.outboundDate,
        currency: params.currency || 'USD',
        hl: params.hl || 'en',
        api_key: this.apiKey,
      };

      // Add return_date and type only if return date is provided
      if (params.returnDate) {
        searchParams.return_date = params.returnDate;
        searchParams.type = '1'; // Round trip
      } else {
        searchParams.type = '0'; // One way
      }

      Object.keys(searchParams).forEach(key => {
        if (searchParams[key as keyof typeof searchParams] === undefined) {
          delete searchParams[key as keyof typeof searchParams];
        }
      });

      console.log("SerpAPI Request URL:", `${this.baseUrl}?${new URLSearchParams(searchParams).toString()}`);
      console.log("Search Parameters:", searchParams);

      const response = await axios.get(this.baseUrl, { params: searchParams });
      
      console.log("SerpAPI Response:", JSON.stringify(response.data, null, 2));
      
      if (response.data.error) {
        console.error("SerpAPI Error:", response.data.error);
        return {
          success: false,
          error: response.data.error
        };
      }

      const flights = this.parseFlightData(response.data);
      
      return {
        success: true,
        data: {
          flights,
          searchParams: params
        }
      };

    } catch (error: any) {
      console.error('Flight search error:', error);
      
      // Handle axios errors specifically
      if (error.response) {
        console.error('SerpAPI Error Response:', error.response.data);
        return {
          success: false,
          error: error.response.data?.error || `HTTP ${error.response.status}: ${error.response.statusText}`
        };
      } else if (error.request) {
        return {
          success: false,
          error: 'Network error: Unable to reach SerpAPI'
        };
      } else {
        return {
          success: false,
          error: error.message || 'Unknown error occurred'
        };
      }
    }
  }

  private parseFlightData(apiResponse: any): FlightOption[] {
    try {
      const flights: FlightOption[] = [];
      
      console.log("Parsing flight data from response structure:", Object.keys(apiResponse));
      
      // SerpAPI Google Flights typically returns data in different structures
      let flightData = null;
      
      // Check for Google Flights specific response structures
      // SerpAPI Google Flights returns data in best_flights and other_flights
      if (apiResponse.best_flights && Array.isArray(apiResponse.best_flights)) {
        flightData = apiResponse.best_flights;
        console.log("Using best_flights data");
      } else if (apiResponse.other_flights && Array.isArray(apiResponse.other_flights)) {
        flightData = apiResponse.other_flights;
        console.log("Using other_flights data");
      } else if (apiResponse.flights && Array.isArray(apiResponse.flights)) {
        flightData = apiResponse.flights;
        console.log("Using flights data");
      } else if (apiResponse.organic_results && Array.isArray(apiResponse.organic_results)) {
        // Sometimes flights are in organic_results
        flightData = apiResponse.organic_results.filter((result: any) => 
          result.title && result.title.toLowerCase().includes('flight')
        );
        console.log("Using organic_results data");
      } else if (apiResponse.answer_box) {
        // Check answer_box for flight information
        if (apiResponse.answer_box.flights) {
          flightData = apiResponse.answer_box.flights;
          console.log("Using answer_box.flights data");
        } else if (apiResponse.answer_box.flight_results) {
          flightData = apiResponse.answer_box.flight_results;
          console.log("Using answer_box.flight_results data");
        }
      } else if (apiResponse.knowledge_graph && apiResponse.knowledge_graph.flights) {
        flightData = apiResponse.knowledge_graph.flights;
        console.log("Using knowledge_graph.flights data");
      } else if (apiResponse.search_metadata && apiResponse.search_metadata.flights) {
        flightData = apiResponse.search_metadata.flights;
        console.log("Using search_metadata.flights data");
      }
      
      console.log("Found flight data:", flightData);
      
      if (flightData && Array.isArray(flightData)) {
        flightData.forEach((flight: any, index: number) => {
          console.log(`Processing flight ${index}:`, JSON.stringify(flight, null, 2));
          
          // Extract flight information with more comprehensive field mapping
          const airline = this.extractAirline(flight);
          const departure = this.extractDeparture(flight);
          const arrival = this.extractArrival(flight);
          const price = this.extractPrice(flight);
          const duration = this.extractDuration(flight);
          const stops = this.extractStops(flight);
          const bookingLink = this.extractBookingLink(flight);
          
          if (airline && airline !== 'Unknown') {
            flights.push({
              airline: airline,
              departure: departure,
              arrival: arrival,
              duration: duration,
              price: price,
              stops: stops,
              bookingLink: bookingLink
            });
          }
        });
      }

      console.log(`Parsed ${flights.length} flights`);
      return flights;
    } catch (error) {
      console.error('Error parsing flight data:', error);
      return [];
    }
  }

  private extractAirline(flight: any): string {
    // SerpAPI Google Flights structure
    if (flight.airline) {
      return flight.airline;
    }
    
    // Check for airline in flight details
    if (flight.flights && Array.isArray(flight.flights)) {
      const firstFlight = flight.flights[0];
      if (firstFlight.airline) {
        return firstFlight.airline;
      }
    }
    
    return flight.airline_name || 
           flight.carrier || 
           flight.airline_code ||
           flight.provider ||
           'Unknown';
  }

  private extractDeparture(flight: any): any {
    // SerpAPI Google Flights structure
    if (flight.departure) {
      return {
        airport: flight.departure.airport || flight.departure.airport_code || 'Unknown',
        time: flight.departure.time || 'Unknown',
        date: flight.departure.date || 'Unknown'
      };
    }
    
    // Check for departure in flight details
    if (flight.flights && Array.isArray(flight.flights)) {
      const firstFlight = flight.flights[0];
      if (firstFlight.departure) {
        return {
          airport: firstFlight.departure.airport || firstFlight.departure.airport_code || 'Unknown',
          time: firstFlight.departure.time || 'Unknown',
          date: firstFlight.departure.date || 'Unknown'
        };
      }
    }
    
    const departure = flight.departure_info || flight.from || {};
    return {
      airport: departure.airport || 
               departure.airport_code || 
               departure.airport_name ||
               departure.from ||
               'Unknown',
      time: departure.time || 
            departure.departure_time || 
            departure.time_departure ||
            'Unknown',
      date: departure.date || 
            departure.departure_date || 
            departure.date_departure ||
            'Unknown'
    };
  }

  private extractArrival(flight: any): any {
    // SerpAPI Google Flights structure
    if (flight.arrival) {
      return {
        airport: flight.arrival.airport || flight.arrival.airport_code || 'Unknown',
        time: flight.arrival.time || 'Unknown',
        date: flight.arrival.date || 'Unknown'
      };
    }
    
    // Check for arrival in flight details
    if (flight.flights && Array.isArray(flight.flights)) {
      const lastFlight = flight.flights[flight.flights.length - 1];
      if (lastFlight.arrival) {
        return {
          airport: lastFlight.arrival.airport || lastFlight.arrival.airport_code || 'Unknown',
          time: lastFlight.arrival.time || 'Unknown',
          date: lastFlight.arrival.date || 'Unknown'
        };
      }
    }
    
    const arrival = flight.arrival_info || flight.to || {};
    return {
      airport: arrival.airport || 
               arrival.airport_code || 
               arrival.airport_name ||
               arrival.to ||
               'Unknown',
      time: arrival.time || 
            arrival.arrival_time || 
            arrival.time_arrival ||
            'Unknown',
      date: arrival.date || 
            arrival.arrival_date || 
            arrival.date_arrival ||
            'Unknown'
    };
  }

  private extractPrice(flight: any): any {
    const price = flight.price || flight.price_info || flight.cost || flight.fare || {};
    
    if (typeof price === 'number') {
      return { amount: price, currency: 'USD' };
    }
    
    if (typeof price === 'string') {
      // Try to extract number from string like "$850" or "850 USD"
      const match = price.match(/(\d+)/);
      return { 
        amount: match ? parseInt(match[1]) : 0, 
        currency: price.includes('EUR') ? 'EUR' : price.includes('GBP') ? 'GBP' : 'USD' 
      };
    }
    
    return {
      amount: price.amount || price.value || price.cost || price.price || 0,
      currency: price.currency || price.currency_code || price.currency_symbol || 'USD'
    };
  }

  private extractDuration(flight: any): string {
    return flight.duration || 
           flight.flight_duration || 
           flight.total_duration ||
           flight.travel_time ||
           flight.time_duration ||
           'Unknown';
  }

  private extractStops(flight: any): number {
    const stops = flight.stops || flight.stopovers || flight.connections || flight.layovers;
    if (typeof stops === 'string') {
      const match = stops.match(/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }
    return stops || 0;
  }

  private extractBookingLink(flight: any): string | undefined {
    return flight.booking_link || 
           flight.link || 
           flight.url ||
           flight.booking_url ||
           flight.book_now_url;
  }


  // Helper method to extract flight parameters from natural language
  extractFlightParams(userInput: string): Partial<FlightSearchParams> | null {
    const params: Partial<FlightSearchParams> = {};
    
    console.log("Extracting flight parameters from:", userInput);
    
    // Extract dates (multiple patterns)
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/g,  // YYYY-MM-DD
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,  // MM/DD/YYYY or DD/MM/YYYY
      /(\d{1,2}-\d{1,2}-\d{4})/g,  // MM-DD-YYYY or DD-MM-YYYY
    ];
    
    let dates: string[] = [];
    datePatterns.forEach(pattern => {
      const matches = userInput.match(pattern);
      if (matches) {
        dates = dates.concat(matches);
      }
    });
    
    if (dates.length > 0) {
      // Convert to YYYY-MM-DD format if needed
      params.outboundDate = this.normalizeDate(dates[0]);
      if (dates.length > 1) {
        params.returnDate = this.normalizeDate(dates[1]);
      }
    }

    // Extract airport codes (3-letter codes)
    const airportPattern = /\b([A-Z]{3})\b/g;
    const airports = userInput.match(airportPattern);
    if (airports && airports.length >= 2) {
      params.departureId = airports[0];
      params.arrivalId = airports[1];
    } else {
      // Try to extract city names and convert to airport codes
      const cityAirports = this.extractCityAirports(userInput);
      if (cityAirports.departure && cityAirports.arrival) {
        params.departureId = cityAirports.departure;
        params.arrivalId = cityAirports.arrival;
      }
    }

    // Extract currency
    const currencyMatch = userInput.match(/\b(USD|EUR|GBP|CAD|AUD|JPY|CHF)\b/i);
    if (currencyMatch) {
      params.currency = currencyMatch[0].toUpperCase();
    }

    // Extract language preference
    const languageMatch = userInput.match(/\b(en|es|fr|de|it|pt|ru|zh|ja|ko)\b/i);
    if (languageMatch) {
      params.hl = languageMatch[0].toLowerCase();
    }

    console.log("Extracted parameters:", params);

    // Return params only if we have minimum required fields
    if (params.departureId && params.arrivalId && params.outboundDate) {
      return params;
    }

    return null;
  }

  private normalizeDate(dateStr: string): string {
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Handle MM/DD/YYYY or DD/MM/YYYY format
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      const [first, second, year] = parts;
      // Assume MM/DD/YYYY if first part > 12, otherwise DD/MM/YYYY
      if (parseInt(first) > 12) {
        return `${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
      } else {
        return `${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`;
      }
    }
    
    return dateStr;
  }

  private extractCityAirports(userInput: string): { departure?: string; arrival?: string } {
    const cityAirportMap: { [key: string]: string } = {
      // Major cities to airport codes
      'beijing': 'PEK', 'shanghai': 'PVG', 'guangzhou': 'CAN', 'shenzhen': 'SZX',
      'london': 'LHR', 'paris': 'CDG', 'frankfurt': 'FRA', 'amsterdam': 'AMS',
      'new york': 'JFK', 'los angeles': 'LAX', 'chicago': 'ORD', 'miami': 'MIA',
      'austin': 'AUS', 'dallas': 'DFW', 'houston': 'IAH', 'atlanta': 'ATL',
      'toronto': 'YYZ', 'vancouver': 'YVR', 'sydney': 'SYD', 'melbourne': 'MEL',
      'tokyo': 'NRT', 'seoul': 'ICN', 'singapore': 'SIN', 'hong kong': 'HKG',
      'dubai': 'DXB', 'istanbul': 'IST', 'moscow': 'SVO', 'mumbai': 'BOM',
      'delhi': 'DEL', 'bangkok': 'BKK', 'kuala lumpur': 'KUL', 'jakarta': 'CGK'
    };

    const lowerInput = userInput.toLowerCase();
    const cities = Object.keys(cityAirportMap);
    const foundCities: string[] = [];

    cities.forEach(city => {
      if (lowerInput.includes(city)) {
        foundCities.push(cityAirportMap[city]);
      }
    });

    if (foundCities.length >= 2) {
      return {
        departure: foundCities[0],
        arrival: foundCities[1]
      };
    }

    return {};
  }
}
