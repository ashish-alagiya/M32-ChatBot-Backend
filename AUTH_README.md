# Authentication API Documentation

This project includes JWT-based authentication with user registration and login functionality.

## Features

- ✅ User registration with email, username, and password
- ✅ Password hashing using bcrypt (salt rounds: 10)
- ✅ User login with email and password
- ✅ JWT token generation and validation
- ✅ Protected route middleware
- ✅ Input validation
- ✅ Duplicate email/username checking

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/your-database-name

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

⚠️ **Important**: Always use a strong, random JWT_SECRET in production!

## API Endpoints

### 1. Register User

**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securePassword123"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "60d5ec49f1b2c8b1f8e4e1a1",
      "email": "user@example.com",
      "username": "johndoe"
    }
  }
}
```

**Error Responses:**

- **400 Bad Request**: Missing required fields or validation error
```json
{
  "success": false,
  "message": "Please provide email, username, and password"
}
```

- **409 Conflict**: Email or username already exists
```json
{
  "success": false,
  "message": "Email already registered"
}
```

### 2. Login User

**POST** `/api/auth/login`

Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "60d5ec49f1b2c8b1f8e4e1a1",
      "email": "user@example.com",
      "username": "johndoe"
    }
  }
}
```

**Error Responses:**

- **400 Bad Request**: Missing email or password
```json
{
  "success": false,
  "message": "Please provide email and password"
}
```

- **401 Unauthorized**: Invalid credentials
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

## Authentication Middleware

To protect routes, use the `authenticate` middleware:

```typescript
import { authenticate } from "./middleware/auth.middleware.js";

// Protected route example
router.get("/profile", authenticate, getProfile);
```

The middleware will:
1. Verify the JWT token from the `Authorization` header
2. Check if the user exists in the database
3. Attach user information to `req.user`

**Using Protected Routes:**

Include the JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Testing the API

### 1. Register a New User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "Test123456"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456"
  }'
```

### 3. Access Protected Route

```bash
curl -X GET http://localhost:3000/api/protected-endpoint \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## Validation Rules

### Email
- Required field
- Must be a valid email format
- Automatically converted to lowercase
- Must be unique

### Username
- Required field
- Minimum length: 3 characters
- Maximum length: 30 characters
- Must be unique
- Trimmed of whitespace

### Password
- Required field
- Minimum length: 6 characters
- Automatically hashed with bcrypt before storage
- Never returned in API responses

## Security Features

1. **Password Hashing**: Passwords are hashed using bcrypt with a salt factor of 10
2. **JWT Tokens**: Stateless authentication using JSON Web Tokens
3. **Token Expiration**: Tokens expire after 7 days by default (configurable)
4. **Case-Insensitive Email**: Emails are stored in lowercase to prevent duplicates
5. **Secure Password Comparison**: Uses bcrypt's compare method for timing-attack resistance
6. **Validation**: Input validation on all fields with meaningful error messages

## File Structure

```
src/
├── models/
│   └── user.model.ts          # User schema with bcrypt hashing
├── controllers/
│   └── auth.controller.ts     # Register and login logic
├── routes/
│   └── auth.routes.ts         # Authentication routes
├── middleware/
│   └── auth.middleware.ts     # JWT verification middleware
└── config/
    └── index.ts               # Configuration including JWT settings
```

## Error Handling

All errors are returned in a consistent format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (in development)"
}
```

## Next Steps

1. Add password reset functionality
2. Add email verification
3. Implement refresh tokens
4. Add rate limiting for login attempts
5. Add user profile management endpoints
6. Add OAuth/Social login options



