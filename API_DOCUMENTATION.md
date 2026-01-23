# 📖 Brief Me API Documentation

Complete API reference for the Brief Me backend service.

**Base URL:** `http://your-ec2-ip:8080` or `https://your-domain.com`

---

## 📑 Table of Contents

1. [Authentication](#authentication)
2. [User APIs](#user-apis)
3. [AI Summarization API](#ai-summarization-api)
4. [Contact API](#contact-api)
5. [Payment APIs](#payment-apis)
6. [Webhook](#webhook)
7. [Error Codes](#error-codes)

---

## 🔐 Authentication

Most endpoints require authentication using **JWT (JSON Web Token)**.

### How to Authenticate

Include the JWT token in the `Authorization` header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Protected Endpoints

The following endpoints require authentication:
- `GET /api/users/profile`
- `POST /api/process/processFiles`
- `POST /api/contactus/post`

---

## 👤 User APIs

### 1. Register User

**Endpoint:** `POST /api/users/register`

**Description:** Register a new user account. An OTP will be sent to the provided email.

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | ✅ Yes | User's email address |
| password | string | ✅ Yes | User's password (min 8 characters recommended) |

**Success Response (201):**

```json
{
  "message": "User registered successfully. Verify OTP.",
  "otp": 123456,
  "email": "user@example.com"
}
```

**Error Response (400):**

```json
{
  "message": "Email already registered"
}
```

**Error Response (500):**

```json
{
  "message": "User registered, but failed to send OTP email.",
  "error": "Error details"
}
```

---

### 2. Verify OTP

**Endpoint:** `POST /api/users/verify-otp`

**Description:** Verify the OTP sent to user's email after registration.

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "otp": 123456
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | ✅ Yes | User's email address |
| otp | number | ✅ Yes | 6-digit OTP received via email |

**Success Response (200):**

```json
{
  "message": "OTP verified successfully"
}
```

**Error Response (400):**

```json
{
  "message": "Invalid OTP"
}
```

```json
{
  "message": "User already verified"
}
```

**Error Response (404):**

```json
{
  "message": "User not found"
}
```

---

### 3. Login

**Endpoint:** `POST /api/users/login`

**Description:** Login with email and password. Returns JWT token.

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | ✅ Yes | User's email address |
| password | string | ✅ Yes | User's password |

**Success Response (200):**

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Token Expiration:** 1 day (24 hours)

**Error Response (400):**

```json
{
  "message": "Invalid credentials"
}
```

**Error Response (403):**

```json
{
  "message": "Please verify your OTP first"
}
```

---

### 4. Get User Profile

**Endpoint:** `GET /api/users/profile`

**Description:** Get the authenticated user's profile information.

**Authentication:** ✅ Required (JWT token)

**Request Headers:**

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Success Response (200):**

```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "pro": false,
  "name": "John Doe"
}
```

**Error Response (401):**

```json
{
  "message": "Not authorized, no token"
}
```

**Error Response (404):**

```json
{
  "message": "User not found"
}
```

---

## 🤖 AI Summarization API

### Process Files (AI Summary)

**Endpoint:** `POST /api/process/processFiles`

**Description:** Upload a file or text and get an AI-generated summary. Supports images, audio, video (MP4), and text input.

**Authentication:** ✅ Required (JWT token)

**Request Type:** `multipart/form-data`

**Request Headers:**

```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Request Body (File Upload):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | ✅ Yes (or text) | Image, audio, or video file |
| length | number | ✅ Yes | Desired word count for summary |
| text | boolean | No | Set to `true` if sending text instead of file |
| textInput | string | Conditional | Required if `text=true` |

**Supported File Types:**
- Images: JPEG, PNG, GIF, WebP
- Audio: MP3, WAV, etc.
- Video: MP4
- Text: Direct text input

**Example Request (File Upload):**

Using `curl`:

```bash
curl -X POST http://your-ec2-ip:8080/api/process/processFiles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "length=100"
```

Using `FormData` (JavaScript):

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('length', 100);

fetch('http://your-ec2-ip:8080/api/process/processFiles', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

**Example Request (Text Input):**

```bash
curl -X POST http://your-ec2-ip:8080/api/process/processFiles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "text=true" \
  -F "textInput=Your long text content here..." \
  -F "length=100"
```

**Success Response (200):**

```json
{
  "status": true,
  "extractedText": "🔹 Summary Title\n\n• Key point 1 with relevant details\n• Key point 2 → important information\n• Key point 3 ✅ actionable insight\n\n🔹 Conclusion\nFinal thoughts and takeaways..."
}
```

**Error Response (401):**

```json
{
  "message": "Not authorized, no token"
}
```

**Error Response (500):**

```json
{
  "status": false,
  "error": "Failed to process file"
}
```

**Notes:**
- Summary format is optimized for readability with emojis and bullets
- No markdown syntax (###, **, ---) in output
- For MP4 videos: extracts text from frames and audio
- Returns "Summary not available" or "No text found" for empty/junk input

---

## 📧 Contact API

### Submit Contact Form

**Endpoint:** `POST /api/contactus/post`

**Description:** Submit a contact/support request.

**Authentication:** ✅ Required (JWT token)

**Request Headers:**

```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "category": "Support",
  "message": "I need help with..."
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ Yes | Contact person's name |
| email | string | ✅ Yes | Contact email address |
| category | string | ✅ Yes | Category (e.g., Support, Bug, Feature Request) |
| message | string | ✅ Yes | Detailed message/description |

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "category": "Support",
    "message": "I need help with...",
    "createdAt": "2026-01-22T10:30:00.000Z"
  },
  "message": "We received your request, we will connect with you, thanks for reaching out us"
}
```

**Error Response (400):**

```json
{
  "error": "All fields are required"
}
```

**Error Response (500):**

```json
{
  "error": "Server error"
}
```

---

## 💳 Payment APIs

### 1. Get Products

**Endpoint:** `GET /api/payment/getProducts`

**Description:** Get available subscription products from LemonSqueezy.

**Authentication:** Not required

**Success Response (200):**

```json
{
  "price": "$9.99",
  "buy_now_url": "https://briefme.lemonsqueezy.com/checkout/buy/..."
}
```

**Error Response (500):**

```json
{
  "status": false
}
```

---

### 2. Get Variants

**Endpoint:** `GET /api/payment/getVariants`

**Description:** Get product variant IDs for subscription checkout.

**Authentication:** Not required

**Success Response (200):**

```json
{
  "type": "Variants",
  "id": "123456",
  "status": true
}
```

**Error Response (500):**

```json
{
  "type": "Variants fetch failed",
  "status": false
}
```

---

### 3. Create Subscription Checkout

**Endpoint:** `POST /api/payment/subscription`

**Description:** Create a LemonSqueezy checkout session for subscription.

**Authentication:** Not required

**Request Body:**

```json
{
  "variantId": 123456,
  "user_id": "YOUR_JWT_TOKEN"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| variantId | number | ✅ Yes | Product variant ID from getVariants |
| user_id | string | ✅ Yes | User's JWT token (will be decoded) |

**Success Response (201):**

```json
{
  "status": true,
  "url": "https://briefme.lemonsqueezy.com/checkout/..."
}
```

**Error Response (400):**

```json
{
  "status": false,
  "error": "Error details"
}
```

**Notes:**
- After successful payment, user is redirected to: `https://briefme.vercel.app`
- User's `pro` status is updated via webhook

---

## 🔔 Webhook

### LemonSqueezy Webhook

**Endpoint:** `POST /webhook`

**Description:** Webhook handler for LemonSqueezy payment events. Updates user's pro status after successful payment.

**Authentication:** Not required (validated by LemonSqueezy)

**Request Body (from LemonSqueezy):**

```json
{
  "meta": {
    "custom_data": {
      "user_id": "507f1f77bcf86cd799439011"
    }
  },
  "data": {
    "type": "order-created",
    "attributes": {
      "status": "paid"
    }
  }
}
```

**Success Response (200):**

```
Ok
```

**Error Response (400):**

```
Webhook handler failed
```

**Notes:**
- Automatically sets `user.pro = true` when payment is successful
- Configure webhook URL in LemonSqueezy dashboard: `https://your-domain.com/webhook`

---

## ❌ Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request completed successfully |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input or missing parameters |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - User not verified or lacks permission |
| 404 | Not Found - Resource not found |
| 500 | Server Error - Internal server error |

---

## 🔒 Security Notes

1. **JWT Token Storage**: Store JWT tokens securely (not in localStorage for production)
2. **HTTPS**: Always use HTTPS in production
3. **Password Requirements**: Minimum 8 characters recommended
4. **Rate Limiting**: Consider implementing rate limiting for production
5. **CORS**: Configure CORS properly for your frontend domain

---

## 🧪 Testing the API

### Using cURL

**Register:**

```bash
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Login:**

```bash
curl -X POST http://localhost:8080/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Get Profile:**

```bash
curl -X GET http://localhost:8080/api/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📦 Response Format

All API responses follow a consistent format:

**Success Response:**

```json
{
  "message": "Success message",
  "data": { ... },
  "status": true
}
```

**Error Response:**

```json
{
  "message": "Error message",
  "error": "Detailed error",
  "status": false
}
```

---

## 🌐 Environment Variables Required

Make sure these are set in your `.env` file:

```env
PORT=8080
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
LEMONSQUEEZY_API_KEY=your-lemonsqueezy-key
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

---

## 📞 Support

For API issues or questions, contact us through the `/api/contactus/post` endpoint.

---

**Last Updated:** January 22, 2026

**API Version:** 1.0.0
