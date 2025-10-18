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
  stops: number | any[];
  bookingLink?: string;
  layovers?: Array<{
    duration: number;
    name: string;
    id: string;
    overnight?: boolean;
  }>;
}

export interface FlightSearchResult {
  success: boolean;
  data?: {
    flights: FlightOption[];
    searchParams: FlightSearchParams;
    googleFlightsUrl?: string;
  };
  error?: string;
}

export class FlightPlanner {
  private apiKey: string;
  private baseUrl: string = 'https://serpapi.com/search.json';

  constructor() {
    this.apiKey = process.env.SERP_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('SERP_API_KEY environment variable is required');
    }
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
    try {
      console.log("=== FLIGHT SEARCH DEBUG ===");
      console.log("Input params:", JSON.stringify(params, null, 2));
      console.log("Has returnDate?", !!params.returnDate);
      
      const searchParams: any = {
        engine: 'google_flights',
        departure_id: params.departureId,
        arrival_id: params.arrivalId,
        outbound_date: params.outboundDate,
        currency: params.currency || 'USD',
        hl: params.hl || 'en',
        adults: 1,
        api_key: this.apiKey,
      };

      console.log("Base search params created (before type logic):", JSON.stringify(searchParams, null, 2));

      const hasReturnDate = params.returnDate && params.returnDate.trim() !== '';
      console.log("Should add return date?", hasReturnDate);
      
      if (hasReturnDate) {
        console.log("Setting type=1 and return_date for ROUND-TRIP");
        searchParams.type = 1;
        searchParams.return_date = params.returnDate;
      } else {
        console.log("NOT setting type for ONE-WAY flight");
      }

      console.log("After type logic:", JSON.stringify(searchParams, null, 2));

      Object.keys(searchParams).forEach(key => {
        const value = searchParams[key as keyof typeof searchParams];
        if (value === undefined || value === null || value === '') {
          console.log(`Removing empty parameter: ${key}`);
          delete searchParams[key as keyof typeof searchParams];
        }
      });

      console.log("After cleanup:", JSON.stringify(searchParams, null, 2));

      if (!searchParams.return_date) {
        if (searchParams.type) {
          console.error("REMOVING 'type' parameter because no return_date is present!");
          delete searchParams.type;
        }
        console.log("Confirmed: No 'type' parameter for one-way flight");
      }

      if (searchParams.type && !searchParams.return_date) {
        console.error("CRITICAL ERROR: type is set but return_date is missing! Forcing removal.");
        delete searchParams.type;
      }

      console.log("=== FINAL PARAMS TO SERPAPI ===");
      console.log(JSON.stringify(searchParams, null, 2));
      console.log("Trip Type:", searchParams.type === 1 ? "Round-trip" : "One-way");
      console.log("Has 'type' param?", 'type' in searchParams);
      console.log("Has 'return_date' param?", 'return_date' in searchParams);
      console.log("===========================");

      const cleanParams = { ...searchParams };
      if (!cleanParams.return_date && cleanParams.type !== undefined) {
        console.error("EMERGENCY FIX: Removing type parameter at last moment!");
        delete cleanParams.type;
      }

      console.log("ACTUAL PARAMS BEING SENT TO AXIOS:");
      console.log(JSON.stringify(cleanParams, null, 2));

      const response = await axios.get<any>(this.baseUrl, { params: cleanParams });
      
      console.log("\n==================== FULL SERPAPI RESPONSE ====================");
      console.log(JSON.stringify(response.data, null, 2));
      console.log("===============================================================\n");
      
      if (response.data.best_flights) {
        console.log("\n🔍 BEST_FLIGHTS SAMPLE:");
        console.log(JSON.stringify(response.data.best_flights[0], null, 2));
      }
      if (response.data.other_flights) {
        console.log("\n🔍 OTHER_FLIGHTS SAMPLE:");
        console.log(JSON.stringify(response.data.other_flights[0], null, 2));
      }
      if (response.data.search_metadata) {
        console.log("\n🔍 SEARCH_METADATA:");
        console.log(JSON.stringify(response.data.search_metadata, null, 2));
      }
      
      if (response.data?.error) {
        console.error("SerpAPI Error:", response.data.error);
        
        if (response.data.error.includes('return_date') || response.data.error.includes('type')) {
          return {
            success: false,
            error: `SerpAPI Error: ${response.data.error}\n\n` +
                   `This might be due to:\n` +
                   `1. Your SerpAPI plan limitations\n` +
                   `2. Specific route restrictions\n` +
                   `3. API configuration issues\n\n` +
                   `Try checking your SerpAPI dashboard at https://serpapi.com/dashboard`
          };
        }
        
        return {
          success: false,
          error: response.data.error
        };
      }

      const flights = this.parseFlightData(response.data);
      const googleFlightsUrl = this.generateGoogleFlightsUrl(params);
      
      return {
        success: true,
        data: {
          flights,
          searchParams: params,
          googleFlightsUrl
        }
      };

    } catch (error: any) {
      console.error('Flight search error:', error);
      
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
      
      let flightData = null;
      
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
        flightData = apiResponse.organic_results.filter((result: any) => 
          result.title && result.title.toLowerCase().includes('flight')
        );
        console.log("Using organic_results data");
      } else if (apiResponse.answer_box) {
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
          console.log(`\n=== Processing flight ${index} ===`);
          console.log('Full flight object keys:', Object.keys(flight));
          console.log('Flight price field:', flight.price);
          console.log('Flight object:', JSON.stringify(flight, null, 2));
          
          const airline = this.extractAirline(flight);
          const departure = this.extractDeparture(flight);
          const arrival = this.extractArrival(flight);
          const price = this.extractPrice(flight);
          const duration = this.extractDuration(flight);
          const stops = this.extractStops(flight);
          const bookingLink = this.extractBookingLink(flight);
          const layovers = flight.layovers && Array.isArray(flight.layovers) ? flight.layovers : undefined;
          
          if (airline && airline !== 'Unknown') {
            flights.push({
              airline: airline,
              departure: departure,
              arrival: arrival,
              duration: duration,
              price: price,
              stops: layovers || stops,
              bookingLink: bookingLink,
              layovers: layovers
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

  private generateGoogleFlightsUrl(params: FlightSearchParams): string {
    const { departureId, arrivalId, outboundDate, returnDate } = params;
    
    const formattedOutbound = outboundDate.replace(/-/g, '');
    const formattedReturn = returnDate ? returnDate.replace(/-/g, '') : null;
    
    let url = 'https://www.google.com/travel/flights';
    
    if (returnDate) {
      url += `/search?tfs=CBwQAhokEgoyMDI1LTEwLTI5agcIARIDQk9NcgcIARIDU1RWGiQSCjIwMjUtMTAtMjlqBwgBEgNTVFZyBwgBEgNCT00gASgBOgFwQAFIAXABggELCP___________wGYAQE`;
      
      url = `https://www.google.com/travel/flights/search?tfs=CBwQAhokag0IAhIJL20vMDRsN3pwEgoyMDI1LTEwLTI5cgcIARID${departureId}GiRqBwgBEgM${arrivalId}Eg4yMDI1LTEwLTI5cg0IAhIJL20vMDRsN3pwIAEoATICCAFAAUgBcAGCAQsI____________AZIBAQI4AXAB`;
      
      url = `https://www.google.com/travel/flights?q=Flights%20from%20${departureId}%20to%20${arrivalId}%20on%20${outboundDate}%20returning%20${returnDate}`;
    } else {
      url = `https://www.google.com/travel/flights?q=Flights%20from%20${departureId}%20to%20${arrivalId}%20on%20${outboundDate}`;
    }
    
    console.log('Generated Google Flights URL:', url);
    return url;
  }

  private extractAirline(flight: any): string {
    if (flight.flights && Array.isArray(flight.flights) && flight.flights.length > 0) {
      const firstFlight = flight.flights[0];
      if (firstFlight.airline) {
        const airlines: string[] = flight.flights
          .map((f: any) => f.airline)
          .filter((a: any) => a && typeof a === 'string');
        const uniqueAirlines = [...new Set(airlines)];
        return uniqueAirlines.length > 1 ? uniqueAirlines.join(' + ') : (uniqueAirlines[0] || 'Unknown');
      }
    }
    
    if (flight.airline && typeof flight.airline === 'string') {
      return flight.airline;
    }
    
    return flight.airline_name || 
           flight.carrier || 
           flight.airline_code ||
           flight.provider ||
           'Unknown';
  }

  private extractDeparture(flight: any): any {
    if (flight.flights && Array.isArray(flight.flights) && flight.flights.length > 0) {
      const firstFlight = flight.flights[0];
      if (firstFlight.departure_airport) {
        return {
          airport: firstFlight.departure_airport.name || firstFlight.departure_airport.id || 'Unknown',
          time: firstFlight.departure_airport.time || 'Unknown',
          date: firstFlight.departure_airport.time ? firstFlight.departure_airport.time.split(' ')[0] : 'Unknown'
        };
      }
      if (firstFlight.departure) {
        return {
          airport: firstFlight.departure.airport || firstFlight.departure.airport_code || 'Unknown',
          time: firstFlight.departure.time || 'Unknown',
          date: firstFlight.departure.date || 'Unknown'
        };
      }
    }
    
    if (flight.departure_airport) {
      return {
        airport: flight.departure_airport.name || flight.departure_airport.id || 'Unknown',
        time: flight.departure_airport.time || 'Unknown',
        date: flight.departure_airport.time ? flight.departure_airport.time.split(' ')[0] : 'Unknown'
      };
    }
    
    if (flight.departure) {
      return {
        airport: flight.departure.airport || flight.departure.airport_code || 'Unknown',
        time: flight.departure.time || 'Unknown',
        date: flight.departure.date || 'Unknown'
      };
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
    if (flight.flights && Array.isArray(flight.flights) && flight.flights.length > 0) {
      const lastFlight = flight.flights[flight.flights.length - 1];
      if (lastFlight.arrival_airport) {
        return {
          airport: lastFlight.arrival_airport.name || lastFlight.arrival_airport.id || 'Unknown',
          time: lastFlight.arrival_airport.time || 'Unknown',
          date: lastFlight.arrival_airport.time ? lastFlight.arrival_airport.time.split(' ')[0] : 'Unknown'
        };
      }
      if (lastFlight.arrival) {
        return {
          airport: lastFlight.arrival.airport || lastFlight.arrival.airport_code || 'Unknown',
          time: lastFlight.arrival.time || 'Unknown',
          date: lastFlight.arrival.date || 'Unknown'
        };
      }
    }
    
    if (flight.arrival_airport) {
      return {
        airport: flight.arrival_airport.name || flight.arrival_airport.id || 'Unknown',
        time: flight.arrival_airport.time || 'Unknown',
        date: flight.arrival_airport.time ? flight.arrival_airport.time.split(' ')[0] : 'Unknown'
      };
    }
    
    if (flight.arrival) {
      return {
        airport: flight.arrival.airport || flight.arrival.airport_code || 'Unknown',
        time: flight.arrival.time || 'Unknown',
        date: flight.arrival.date || 'Unknown'
      };
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
    console.log('\n===== EXTRACTING PRICE =====');
    console.log('Full flight keys:', Object.keys(flight));
    console.log('flight.price:', flight.price);
    console.log('flight.cost:', flight.cost);
    console.log('flight.fare:', flight.fare);
    console.log('flight.amount:', flight.amount);
    console.log('flight.price_info:', flight.price_info);
    console.log('Type of flight.price:', typeof flight.price);
    console.log('==============================\n');

    let priceValue = null;
    let currency = 'USD';

    if (typeof flight.price === 'number') {
      priceValue = flight.price;
    }
    else if (typeof flight.price === 'string') {
      const match = flight.price.match(/[\d,]+/);
      if (match) {
        priceValue = parseInt(match[0].replace(/,/g, ''));
      }
      if (flight.price.includes('₹') || flight.price.includes('INR')) currency = 'INR';
      else if (flight.price.includes('€') || flight.price.includes('EUR')) currency = 'EUR';
      else if (flight.price.includes('£') || flight.price.includes('GBP')) currency = 'GBP';
      else if (flight.price.includes('$') || flight.price.includes('USD')) currency = 'USD';
    }
    else if (flight.price && typeof flight.price === 'object') {
      priceValue = flight.price.amount || flight.price.value || flight.price.price;
      currency = flight.price.currency || flight.price.currency_code || currency;
    }

    if (!priceValue) {
      priceValue = flight.cost || flight.fare || flight.amount || 
                   flight.price_info?.amount || flight.price_info?.value;
      currency = flight.currency || flight.price_info?.currency || currency;
    }

    if (!priceValue && flight.flights && Array.isArray(flight.flights)) {
      const firstFlight = flight.flights[0];
      if (firstFlight?.price) {
        if (typeof firstFlight.price === 'number') {
          priceValue = firstFlight.price;
        } else if (typeof firstFlight.price === 'object') {
          priceValue = firstFlight.price.amount || firstFlight.price.value;
          currency = firstFlight.price.currency || currency;
        }
      }
    }

    const result = {
      amount: priceValue || 0,
      currency: currency
    };

    console.log('Extracted price:', result);
    return result;
  }

  private extractDuration(flight: any): string {
    if (flight.total_duration) {
      return flight.total_duration;
    }
    
    return flight.duration || 
           flight.flight_duration || 
           flight.travel_time ||
           flight.time_duration ||
           'Unknown';
  }

  private extractStops(flight: any): number {
    if (flight.layovers && Array.isArray(flight.layovers)) {
      return flight.layovers.length;
    }
    
    const stops = flight.stops || flight.stopovers || flight.connections;
    if (typeof stops === 'string') {
      const match = stops.match(/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }
    if (typeof stops === 'number') {
      return stops;
    }
    if (Array.isArray(stops)) {
      return stops.length;
    }
    return 0;
  }

  private extractBookingLink(flight: any): string | undefined {
    return flight.booking_link || 
           flight.link || 
           flight.url ||
           flight.booking_url ||
           flight.book_now_url;
  }


  extractFlightParams(userInput: string): Partial<FlightSearchParams> | null {
    const params: Partial<FlightSearchParams> = {};
    const lowerInput = userInput.toLowerCase();
    
    console.log("Extracting flight parameters from:", userInput);
    
    const returnDatePatterns = [
      /return(?:ing)?\s*(?:date|on)?[:\s]+(\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{2,4})?)/i,
      /come\s*back\s*(?:on)?[:\s]*(\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{2,4})?)/i,
      /returning\s*(?:on)?[:\s]*(\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{2,4})?)/i,
    ];
    
    let returnDateMatch: string | null = null;
    for (const pattern of returnDatePatterns) {
      const match = userInput.match(pattern);
      if (match && match[1]) {
        returnDateMatch = match[1];
        console.log("Found return date keyword match:", returnDateMatch);
        break;
      }
    }
    
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/g,
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(\d{1,2}-\d{1,2}-\d{4})/g,
      /(\d{1,2}-\d{1,2})/g,
    ];
    
    let dates: string[] = [];
    
    const today = new Date();
    const naturalDates = [
      { patterns: ['tomorrow'], offset: 1 },
      { patterns: ['day after tomorrow', 'day after'], offset: 2 },
      { patterns: ['next week'], offset: 7 },
      { patterns: ['next month'], offset: 30 },
    ];
    
    let foundNaturalDate = false;
    for (const nat of naturalDates) {
      if (nat.patterns.some(p => lowerInput.includes(p))) {
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + nat.offset);
        dates.push(futureDate.toISOString().split('T')[0]);
        foundNaturalDate = true;
        console.log("Found natural date:", dates[0]);
        break;
      }
    }
    
    if (!foundNaturalDate) {
      const monthNameDates = this.extractMonthNameDates(userInput);
      if (monthNameDates.length > 0) {
        dates = monthNameDates;
        foundNaturalDate = true;
        console.log("Found month name dates:", dates);
      }
    }
    
    if (!foundNaturalDate) {
      datePatterns.forEach(pattern => {
        const matches = userInput.match(pattern);
        if (matches) {
          dates = dates.concat(matches);
        }
      });
    }
    
    if (dates.length > 0) {
      params.outboundDate = this.normalizeDate(dates[0]);
      console.log("Outbound date:", params.outboundDate);
    }
    
    if (returnDateMatch) {
      params.returnDate = this.normalizeDate(returnDateMatch);
      console.log("Return date (from keyword):", params.returnDate);
    } else if (dates.length > 1 && dates[1]) {
      params.returnDate = this.normalizeDate(dates[1]);
      console.log("Return date (from multiple dates):", params.returnDate);
    }

    const airportPattern = /\b([A-Z]{3})\b/g;
    const airports = userInput.match(airportPattern);
    if (airports && airports.length >= 2) {
      params.departureId = airports[0];
      params.arrivalId = airports[1];
    } else {
      const cityAirports = this.extractCityAirports(userInput);
      if (cityAirports.departure && cityAirports.arrival) {
        params.departureId = cityAirports.departure;
        params.arrivalId = cityAirports.arrival;
      }
    }

    const currencyMatch = userInput.match(/\b(USD|EUR|GBP|CAD|AUD|JPY|CHF)\b/i);
    if (currencyMatch) {
      params.currency = currencyMatch[0].toUpperCase();
    }

    const languageMatch = userInput.match(/\b(en|es|fr|de|it|pt|ru|zh|ja|ko)\b/i);
    if (languageMatch) {
      params.hl = languageMatch[0].toLowerCase();
    }

    console.log("Extracted parameters:", params);

    if (params.departureId && params.arrivalId && params.outboundDate) {
      return params;
    }

    return null;
  }

  private extractMonthNameDates(userInput: string): string[] {
    const dates: string[] = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    
    const monthMap: { [key: string]: number } = {
      'january': 1, 'jan': 1,
      'february': 2, 'feb': 2,
      'march': 3, 'mar': 3,
      'april': 4, 'apr': 4,
      'may': 5,
      'june': 6, 'jun': 6,
      'july': 7, 'jul': 7,
      'august': 8, 'aug': 8,
      'september': 9, 'sep': 9, 'sept': 9,
      'october': 10, 'oct': 10,
      'november': 11, 'nov': 11,
      'december': 12, 'dec': 12
    };
    
    const monthNamePattern = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
    
    let match;
    while ((match = monthNamePattern.exec(userInput)) !== null) {
      const monthName = match[1].toLowerCase();
      const day = parseInt(match[2]);
      const month = monthMap[monthName];
      
      if (month && day >= 1 && day <= 31) {
        const testDate = new Date(currentYear, month - 1, day);
        const year = testDate < today ? currentYear + 1 : currentYear;
        
        const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        dates.push(formattedDate);
        console.log(`Extracted month name date: ${match[0]} -> ${formattedDate}`);
      }
    }
    
    return dates;
  }

  private normalizeDate(dateStr: string): string {
    console.log("Normalizing date:", dateStr);
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    const parts = dateStr.split(/[\/\-]/);
    const today = new Date();
    const currentYear = today.getFullYear();
    
    if (parts.length === 2) {
      const [first, second] = parts.map(p => parseInt(p));
      
      let day: number, month: number;
      if (first > 12) {
        day = first;
        month = second;
      } else if (second > 12) {
        month = first;
        day = second;
      } else {
        day = first;
        month = second;
      }
      
      const testDate = new Date(currentYear, month - 1, day);
      const year = testDate < today ? currentYear + 1 : currentYear;
      
      const normalized = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      console.log("Normalized short date to:", normalized);
      return normalized;
    }
    
    if (parts.length === 3) {
      let [first, second, year] = parts;
      const firstNum = parseInt(first);
      const secondNum = parseInt(second);
      let yearNum = parseInt(year);
      
      if (yearNum < 100) {
        yearNum += 2000;
      }
      
      let day: number, month: number;
      if (firstNum > 12) {
        day = firstNum;
        month = secondNum;
      } else if (secondNum > 12) {
        month = firstNum;
        day = secondNum;
      } else {
        day = firstNum;
        month = secondNum;
      }
      
      const normalized = `${yearNum}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      console.log("Normalized full date to:", normalized);
      return normalized;
    }
    
    console.log("Could not normalize, returning original:", dateStr);
    return dateStr;
  }

  private extractCityAirports(userInput: string): { departure?: string; arrival?: string } {
    const cityAirportMap: { [key: string]: string } = {
      'mumbai': 'BOM', 'delhi': 'DEL', 'new delhi': 'DEL', 'bangalore': 'BLR', 
      'bengaluru': 'BLR', 'kolkata': 'CCU', 'chennai': 'MAA', 'hyderabad': 'HYD',
      'ahmedabad': 'AMD', 'pune': 'PNQ', 'goa': 'GOI', 'jaipur': 'JAI',
      'lucknow': 'LKO', 'kochi': 'COK', 'cochin': 'COK', 'thiruvananthapuram': 'TRV',
      'trivandrum': 'TRV', 'chandigarh': 'IXC', 'coimbatore': 'CJB', 
      'vadodara': 'BDQ', 'baroda': 'BDQ', 'indore': 'IDR', 'nagpur': 'NAG',
      'surat': 'STV', 'visakhapatnam': 'VTZ', 'bhubaneswar': 'BBI', 'patna': 'PAT',
      'ranchi': 'IXR', 'udaipur': 'UDR', 'amritsar': 'ATQ', 'srinagar': 'SXR',
      'guwahati': 'GAU', 'imphal': 'IMF', 'agartala': 'IXA', 'varanasi': 'VNS',
      
      'beijing': 'PEK', 'shanghai': 'PVG', 'guangzhou': 'CAN', 'shenzhen': 'SZX',
      'chengdu': 'CTU', 'hangzhou': 'HGH', 'xi\'an': 'XIY', 'xian': 'XIY',
      
      'london': 'LHR', 'paris': 'CDG', 'frankfurt': 'FRA', 'amsterdam': 'AMS',
      'madrid': 'MAD', 'rome': 'FCO', 'barcelona': 'BCN', 'berlin': 'BER',
      'istanbul': 'IST', 'moscow': 'SVO', 'dublin': 'DUB', 'vienna': 'VIE',
      'zurich': 'ZRH', 'geneva': 'GVA', 'brussels': 'BRU', 'copenhagen': 'CPH',
      
      'new york': 'JFK', 'los angeles': 'LAX', 'chicago': 'ORD', 'miami': 'MIA',
      'austin': 'AUS', 'dallas': 'DFW', 'houston': 'IAH', 'atlanta': 'ATL',
      'san francisco': 'SFO', 'seattle': 'SEA', 'boston': 'BOS', 'washington': 'IAD',
      'las vegas': 'LAS', 'orlando': 'MCO', 'phoenix': 'PHX', 'denver': 'DEN',
      
      'toronto': 'YYZ', 'vancouver': 'YVR', 'montreal': 'YUL', 'calgary': 'YYC',
      
      'sydney': 'SYD', 'melbourne': 'MEL', 'brisbane': 'BNE', 'perth': 'PER',
      
      'tokyo': 'NRT', 'seoul': 'ICN', 'singapore': 'SIN', 'hong kong': 'HKG',
      'dubai': 'DXB', 'bangkok': 'BKK', 'kuala lumpur': 'KUL', 'jakarta': 'CGK',
      'manila': 'MNL', 'taipei': 'TPE', 'ho chi minh': 'SGN', 'saigon': 'SGN',
      'hanoi': 'HAN', 'kathmandu': 'KTM', 'dhaka': 'DAC', 'colombo': 'CMB',
      'karachi': 'KHI', 'lahore': 'LHE', 'islamabad': 'ISB'
    };

    const lowerInput = userInput.toLowerCase();
    
    const fromToPattern = /from\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+on|\s+in|\s+at|$)/i;
    const match = lowerInput.match(fromToPattern);
    
    if (match) {
      const fromCity = match[1].trim();
      const toCity = match[2].trim();
      
      let departureCode: string | undefined;
      let arrivalCode: string | undefined;
      
      for (const [city, code] of Object.entries(cityAirportMap)) {
        if (fromCity.includes(city) || city.includes(fromCity)) {
          departureCode = code;
        }
        if (toCity.includes(city) || city.includes(toCity)) {
          arrivalCode = code;
        }
      }
      
      if (departureCode && arrivalCode) {
        return {
          departure: departureCode,
          arrival: arrivalCode
        };
      }
    }
    
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
