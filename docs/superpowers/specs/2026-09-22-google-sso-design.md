# Google SSO Authentication Design

## Scope

Implement Google-only authentication. The frontend obtains a Google ID token with `@react-oauth/google`; the backend verifies it and issues application tokens. Email/password authentication is out of scope.

## Roles

Roles are integer constants shared by frontend and backend: `STUDENT = 1`, `TEACHER = 2`, and `SYSTEM_ADMIN = 3`. New users may self-select only STUDENT or TEACHER. Missing or invalid registration role falls back to STUDENT. Existing users keep their stored role; login requests cannot change it.

## Data model

`User` stores `email`, `username`, integer `role`, timestamps, and has many `AuthIdentity` and `AuthSession` records. `AuthIdentity` stores `provider`, `providerId` (Google `sub`), and a compound unique constraint on provider/providerId. `AuthSession` stores a hash of the refresh token, expiry, optional revocation time, user relation, and timestamps.

## Authentication flow

`POST /api/auth/google` accepts `credential` and optional `role`. The backend verifies signature, audience, issuer, expiry, and verified email using `google-auth-library`. It finds identity by provider/providerId, otherwise links a verified matching email or creates a user and identity. It returns a short-lived access JWT and sets a long-lived refresh token in an HttpOnly cookie.

`POST /api/auth/refresh` validates and rotates the refresh session and returns a new access token. `POST /api/auth/logout` revokes the session and clears the cookie. `GET /api/auth/me` returns the authenticated user.

Access tokens are short-lived (about 15 minutes). Refresh tokens live about 7 days, are stored only as HttpOnly cookies, and only their hashes are persisted. Refresh failure returns 401.

## Frontend

Wrap the app with `GoogleOAuthProvider` using `VITE_GOOGLE_CLIENT_ID`. Login displays only Google sign-in. Registration displays STUDENT/TEACHER selection and sends the selected role. A shared Google auth hook stores only the application access token, updates AuthContext, and navigates to `/dashboard`. Axios retries a 401 once after calling refresh, then redirects to login if refresh fails. `UserInfo` contains only userId, username, email, and role.

## Configuration

Backend requires `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and `DATABASE_URL`. Frontend requires `VITE_API_BASE_URL` and `VITE_GOOGLE_CLIENT_ID`. Production cookies are Secure and use an appropriate SameSite policy.

## Error handling and tests

Malformed requests return 400; invalid Google credentials or application tokens return 401; database/configuration failures return 500 without exposing provider details. Tests cover new-user provisioning, role fallback and admin rejection, identity lookup/linking, invalid Google tokens, access-token refresh and rotation, logout revocation, `/me` authorization, and frontend retry/redirect behavior.

## Implementation constraints

Do not create or commit implementation changes after coding is complete. Do not create migration files; update only `backend/prisma/schema.prisma` for the data model. All user-facing text and API error messages must be written in complete Vietnamese with proper diacritics.


