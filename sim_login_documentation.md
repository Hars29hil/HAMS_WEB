# SIM-Based Auto-Login System Documentation

This document explains the flow, architecture, and API endpoints for the SIM presence detection and authentication system used in the HAMS application.

## Overview
The system relies on reading the hardware SIM card(s) inserted into the user's mobile device. It ensures that a student can only log in (either automatically or manually) if their registered mobile number physically matches the SIM card present in the device making the request. 

---

## Application Flow

### 1. App Initialization & Permissions
When the user opens the app (`LoginPage` in Flutter), the app first requests the necessary permissions:
- Standard OS Permissions (`Permission.phone`, `Permission.bluetooth`, etc.)
- Specific plugin permissions (`MobileNumber.requestPhonePermission`)

### 2. Auto-Login Flow (Zero-Click)
If permissions are granted, the app automatically attempts to log the user in without requiring any input:
1. **Detect SIMs:** The app reads the device's current SIM cards using the `mobile_number` plugin (`MobileNumber.getSimCards`).
2. **Extract Numbers:** It extracts the phone numbers attached to the SIM cards into a list (e.g., `simNumbers`).
3. **API Request:** The app sends a background `POST` request to `/api/auth/auto-login` containing the `sim_numbers` array.
4. **Backend Matching:** 
   - The backend compares the provided `sim_numbers` against the `assigned_mobile` field of all active students in the database (comparing the last 10 digits).
   - If a match is found, it generates a JWT token.
   - It also queries the external AVD API (`https://api.avdvvn.org/public/getStudentBasicDetails`) to enrich the response with the student's room and email.
5. **Success:** The app receives the token, stores it locally, and redirects the user to the `StudentDashboardPage`.

### 3. Manual Login Flow (Fallback)
If auto-login fails (e.g., new device, SIM not read properly, or no SIM match found), the user must use the manual login:
1. **User Input:** The user enters their Bank Code into the input field.
2. **Detect SIMs:** When they press "Secure Login", the app again reads the currently inserted SIM cards.
3. **API Request:** The app sends a `POST` request to `/api/auth/login` with `username` (Bank Code) and `sim_numbers`.
4. **Backend Verification:**
   - The backend validates the Bank Code (checking hardcoded roles or fetching from the external AVD API).
   - If the user is a student, the backend checks if their `assigned_mobile` exists.
   - It then verifies if the `assigned_mobile` matches **any** of the numbers provided in the `sim_numbers` array (matching the last 10 digits).
   - **Rejection:** If the SIM numbers do not match the assigned mobile, the login is explicitly blocked with the error: *"SIM Verification Failed: Your assigned mobile number is not present in this device."*
5. **Success:** If verified, a JWT token is returned and the user is redirected to the dashboard.

---

## API Endpoints

### 1. Auto Login Endpoint
**Endpoint:** `POST /api/auth/auto-login`
**Purpose:** Attempts to log in a user solely based on the SIM cards present in their device.

**Request Body:**
```json
{
  "sim_numbers": ["+919876543210", "1234567890"]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "role": "student",
      "name": "John Doe",
      "floor_id": 4,
      "room": "409",
      "phone": "9876543210",
      "email": "student@example.com"
    }
  }
}
```

**Failure Responses:**
- `400 Bad Request`: `{ "success": false, "message": "No SIM numbers provided" }`
- `404 Not Found`: `{ "success": false, "message": "No matching student found" }`

---

### 2. Manual Login Endpoint (with SIM Validation)
**Endpoint:** `POST /api/auth/login`
**Purpose:** Authenticates a user using their Bank Code, but mandates that the SIM card matching their profile is present in the device.

**Request Body:**
```json
{
  "username": "01723",
  "sim_numbers": ["+919876543210"]
}
```
*(Note: `bank_code` is also accepted as an alias for `username`)*

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "role": "STUDENT",
      "name": "John Doe",
      "floor_id": 4,
      "room": "409",
      "phone": "9876543210",
      "email": "student@example.com"
    }
  }
}
```

**Failure Responses:**
- `400 Bad Request`: `{ "success": false, "message": "Missing Bank Code" }`
- `401 Unauthorized`: `{ "success": false, "message": "Invalid Bank Code" }`
- `401 Unauthorized`: `{ "success": false, "message": "Mobile number not assigned. Please contact your floor leader to assign your mobile number." }`
- `401 Unauthorized`: `{ "success": false, "message": "SIM Verification Failed: Your assigned mobile number is not present in this device." }`

---

## Key Files
- **Frontend Logic:** [`frontend/lib/pages/auth/login_page.dart`](file:///d:/Harshil/project/HAMS_FULLSTACK/frontend/lib/pages/auth/login_page.dart) - Handles requesting permissions, reading the SIM card via `MobileNumber`, and communicating with the auth API.
- **Backend Routes:** [`attendance-backend/routes/auth.js`](file:///d:/Harshil/project/HAMS_FULLSTACK/attendance-backend/routes/auth.js) - Contains the `/login` and `/auto-login` endpoints that enforce the SIM validation rules against the MySQL `students` table.
