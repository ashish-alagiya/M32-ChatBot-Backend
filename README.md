# API Server with MongoDB Health Checks

A simple Express API server with MongoDB integration and comprehensive health check endpoints.

## 🚀 Features

- ✅ Server health check endpoint
- ✅ MongoDB health check endpoint
- ✅ Combined health check (server + database)
- ✅ TypeScript support
- ✅ Automatic MongoDB connection on startup
- ✅ Graceful shutdown handling
- ✅ CORS enabled
- ✅ Request logging

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB (local or Atlas)
- npm or yarn

## 🛠️ Installation

1. Clone the repository:
```bash
cd /Users/mac/Documents/chat-bot2-M32
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Configure environment variables:
```env
MONGODB_URI=mongodb://localhost:27017/chatbot
PORT=3000
NODE_ENV=development
```

## 🏃 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## 📡 API Endpoints

### 1. Server Health Check
**GET** `/api/health`

Returns server status, uptime, and memory usage.

**Response:**
```json
{
  "success": true,
  "message": "Server is healthy",
  "timestamp": "2025-10-17T10:30:00.000Z",
  "uptime": "5 minutes",
  "memory": {
    "used": "45 MB",
    "total": "100 MB"
  }
}
```

### 2. Database Health Check
**GET** `/api/health/database`

Returns MongoDB connection status and database statistics.

**Response:**
```json
{
  "success": true,
  "message": "Database is healthy",
  "status": "connected",
  "database": "chatbot",
  "stats": {
    "collections": 3,
    "dataSize": "256 KB",
    "indexSize": "64 KB",
    "storageSize": "512 KB"
  },
  "timestamp": "2025-10-17T10:30:00.000Z"
}
```

### 3. Full Health Check
**GET** `/api/health/full`

Returns combined server and database health status.

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-10-17T10:30:00.000Z",
  "server": {
    "status": "healthy",
    "uptime": "5 minutes",
    "memory": {
      "used": "45 MB",
      "total": "100 MB"
    }
  },
  "database": {
    "status": "connected",
    "healthy": true,
    "name": "chatbot",
    "collections": 3
  }
}
```

## 🧪 Testing the API

### Using cURL

```bash
# Server health check
curl http://localhost:3000/api/health

# Database health check
curl http://localhost:3000/api/health/database

# Full health check
curl http://localhost:3000/api/health/full
```

### Using Browser

Simply open:
- http://localhost:3000/api/health
- http://localhost:3000/api/health/database
- http://localhost:3000/api/health/full

## 📁 Project Structure

```
chat-bot2-M32/
├── src/
│   ├── config/
│   │   ├── database.ts       # MongoDB connection setup
│   │   └── index.ts          # Configuration variables
│   ├── controllers/
│   │   └── health.controller.ts  # Health check logic
│   ├── routes/
│   │   └── health.routes.ts  # API routes
│   ├── utils/
│   │   └── database.utils.ts # Database helper functions
│   └── index.ts              # Application entry point
├── .env                      # Environment variables (create this)
├── .env.example              # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/chatbot` | MongoDB connection string |
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment (development/production) |
| `LOG_LEVEL` | No | `info` | Logging level |

### MongoDB Connection

**Local MongoDB:**
```env
MONGODB_URI=mongodb://localhost:27017/chatbot
```

**MongoDB Atlas (Cloud):**
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatbot?retryWrites=true&w=majority
```

## 🚀 Deployment

### Deploy to Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`
4. Add environment variables:
   - `MONGODB_URI`
   - `NODE_ENV=production`
5. Deploy!

## 🛠️ Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Build and run production server
- `npm run type-check` - Check TypeScript types
- `npm run clean` - Remove dist folder

## 🐛 Troubleshooting

### MongoDB Connection Failed

```bash
# Check if MongoDB is running (local)
sudo systemctl status mongod  # Linux
brew services list             # macOS

# Start MongoDB
sudo systemctl start mongod    # Linux
brew services start mongodb-community  # macOS
```

### Port Already in Use

Change the port in `.env`:
```env
PORT=4000
```

## 📊 Health Check Response Codes

| Endpoint | Success | Database Down | Server Error |
|----------|---------|---------------|--------------|
| `/api/health` | 200 | - | 500 |
| `/api/health/database` | 200 | 503 | 500 |
| `/api/health/full` | 200 | 503 | 500 |

## 🔐 Security

- CORS enabled for cross-origin requests
- Environment variables for sensitive data
- `.env` file excluded from git
- Graceful shutdown on termination signals

## 📝 License

MIT License

## 👨‍💻 Author

Your Name

---

**Made with ❤️ using Express, MongoDB, and TypeScript**
