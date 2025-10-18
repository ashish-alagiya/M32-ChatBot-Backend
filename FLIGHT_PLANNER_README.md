# Flight Planner Bot Integration

This chatbot now includes intelligent flight planning capabilities using SerpAPI's Google Flights integration.

## Features

- ✅ **Smart Flight Detection**: Automatically detects flight-related queries
- ✅ **Natural Language Processing**: Extracts flight parameters from user input
- ✅ **SerpAPI Integration**: Real-time flight search using Google Flights
- ✅ **AI-Powered Responses**: Gemini AI provides intelligent flight recommendations
- ✅ **Comprehensive Error Handling**: Graceful handling of API errors and edge cases
- ✅ **Flexible Input Format**: Supports various ways of requesting flights

## Environment Variables

Add the following environment variable to your `.env` file:

```env
# SerpAPI Configuration
SERP_API_KEY=your-serpapi-key-here
```

To get a SerpAPI key:
1. Go to [SerpAPI](https://serpapi.com/)
2. Sign up for an account
3. Get your API key from the dashboard
4. Add it to your `.env` file

## API Usage

### Flight Search Request

**POST** `/api/chat/generate`

Send a flight-related prompt to automatically trigger flight search functionality.

**Request Body:**
```json
{
  "prompt": "Find flights from PEK to AUS on 2025-10-18 returning 2025-10-24"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Flight search completed",
  "data": {
    "prompt": "Find flights from PEK to AUS on 2025-10-18 returning 2025-10-24",
    "response": "Based on your search, I found several flight options...",
    "timestamp": "2025-01-27T10:30:00.000Z",
    "type": "flight_search",
    "flightData": {
      "flights": [
        {
          "airline": "American Airlines",
          "departure": {
            "airport": "PEK",
            "time": "14:30",
            "date": "2025-10-18"
          },
          "arrival": {
            "airport": "AUS",
            "time": "18:45",
            "date": "2025-10-18"
          },
          "duration": "4h 15m",
          "price": {
            "amount": 850,
            "currency": "USD"
          },
          "stops": 0,
          "bookingLink": "https://..."
        }
      ],
      "searchParams": {
        "departureId": "PEK",
        "arrivalId": "AUS",
        "outboundDate": "2025-10-18",
        "returnDate": "2025-10-24",
        "currency": "USD"
      },
      "searchUrl": "https://www.google.com/travel/flights?..."
    }
  }
}
```

## Supported Input Formats

The bot can understand various ways of requesting flights:

### 1. Direct Format
```
"Find flights from PEK to AUS on 2025-10-18"
```

### 2. Natural Language
```
"I want to fly from Beijing to Austin on October 18th, 2025"
```

### 3. With Return Date
```
"Search flights from LAX to NYC departing 2025-10-18 returning 2025-10-24"
```

### 4. With Currency
```
"Find flights from LHR to CDG on 2025-10-18 in EUR"
```

## Flight Search Parameters

The bot automatically extracts:

- **Departure Airport**: 3-letter IATA code (e.g., PEK, LAX, LHR)
- **Arrival Airport**: 3-letter IATA code (e.g., AUS, NYC, CDG)
- **Departure Date**: YYYY-MM-DD format
- **Return Date**: YYYY-MM-DD format (optional)
- **Currency**: USD, EUR, GBP, CAD, AUD (defaults to USD)

## Response Types

### 1. Flight Search Results
When flight parameters are successfully extracted and flights are found:
- `type: "flight_search"`
- Includes detailed flight information
- AI-powered recommendations and analysis

### 2. Clarification Request
When flight parameters cannot be extracted:
- `type: "flight_clarification"`
- Provides guidance on required information format
- Suggests example queries

### 3. Regular Chat
When the query is not flight-related:
- Uses standard Gemini AI response
- No special flight processing

## Error Handling

The system handles various error scenarios:

- **Missing API Key**: Returns 500 error with configuration guidance
- **Invalid Flight Parameters**: Asks for clarification
- **No Flights Found**: Informs user and suggests alternatives
- **API Rate Limits**: Graceful degradation with retry suggestions
- **Network Issues**: Proper error messages and fallback responses

## Example Usage

### Using cURL

```bash
# Basic flight search
curl -X POST http://localhost:3000/api/chat/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Find flights from PEK to AUS on 2025-10-18"}'

# Round trip with currency
curl -X POST http://localhost:3000/api/chat/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Search flights from LAX to NYC departing 2025-10-18 returning 2025-10-24 in USD"}'
```

### Using JavaScript/Fetch

```javascript
const response = await fetch('http://localhost:3000/api/chat/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'I need flights from London to Paris on 2025-10-18'
  })
});

const data = await response.json();
if (data.data.type === 'flight_search') {
  console.log('Found flights:', data.data.flightData.flights);
} else {
  console.log('AI Response:', data.data.response);
}
```

## File Structure

```
src/
├── controllers/
│   └── chat.controller.ts     # Updated with flight planning logic
├── utils/
│   └── flightPlanner.utils.ts # SerpAPI integration utility
└── routes/
    └── chat.routes.ts         # Chat API routes (unchanged)
```

## Integration Details

The flight planner integrates seamlessly with the existing chat system:

1. **Automatic Detection**: Keywords trigger flight planning mode
2. **Parameter Extraction**: Natural language processing extracts flight details
3. **API Integration**: SerpAPI provides real-time flight data
4. **AI Enhancement**: Gemini AI adds intelligent analysis and recommendations
5. **Unified Response**: Consistent API response format for all query types

This creates a powerful, intelligent flight planning assistant that can handle both general chat and specific flight search requests through a single API endpoint.
