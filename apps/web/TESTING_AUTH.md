# Testing Keycloak Authentication - Quick Guide

## Prerequisites

All services should be running:

- ✅ PostgreSQL (port 5432)
- ✅ Keycloak (port 8080)
- ✅ Redis (port 6379)
- ✅ Backend API (port 3000)
- ✅ Frontend Web (port 3001)

## Test User Credentials

- **Username**: `testuser`
- **Password**: `testpass123`
- **Email**: `test@plexica.dev`

## Testing Steps

### 1. Access the Application

Open your browser and navigate to:

```
http://localhost:3001
```

### 2. Expected Flow

1. **Initial Load**: You'll see the AuthProvider loading spinner while Keycloak initializes
2. **Redirect to Login**: If not authenticated, you'll be redirected to `/login`
3. **Login Page**: Click "Sign in with Keycloak" button
4. **Keycloak Login**: You'll be redirected to Keycloak login page at `http://localhost:8080`
5. **Enter Credentials**: Use the test user credentials above
6. **Redirect Back**: After successful login, you'll be redirected back to `http://localhost:3001`
7. **Protected Page**: You'll see the authenticated home page with user info

### 3. What You Should See

On the authenticated home page:

- Header with "Welcome, Test User" and Logout button
- User information card showing:
  - User ID
  - Email
  - Name
  - Roles
- Next steps section

### 4. Testing Logout

1. Click the "Logout" button in the header
2. You'll be logged out from Keycloak
3. You'll be redirected back to the login page

### 5. Testing Protected Routes

1. Try accessing `http://localhost:3001` directly when not logged in
2. You should be redirected to `/login`
3. After login, you should be back on the home page

## Troubleshooting

### Browser Console Errors

Open browser DevTools (F12) and check the Console tab for any errors.

Look for:

- `[AuthProvider] Initializing Keycloak...`
- `[AuthProvider] User authenticated, fetching user info...`
- `[AuthProvider] User info stored:`

### Network Tab

Check the Network tab for:

- Request to Keycloak: `http://localhost:8080/realms/master/protocol/openid-connect/auth`
- Token exchange after redirect
- User info request: `http://localhost:8080/realms/master/protocol/openid-connect/userinfo`

### Common Issues

**Issue**: "Failed to initialize Keycloak"

- Check if Keycloak is running: `docker ps | grep keycloak`
- Check Keycloak logs: `docker logs plexica-keycloak`

**Issue**: "Client not found"

- Verify client exists in Keycloak admin panel: `http://localhost:8080/admin`
- Login with admin/admin
- Check Clients section for "plexica-web"

**Issue**: "Invalid redirect URI"

- Ensure client has redirect URI: `http://localhost:3001/*`
- Check Web Origins: `http://localhost:3001`

## Verification Checklist

- [ ] Dev server running on port 3001
- [ ] Keycloak running on port 8080
- [ ] Can access login page
- [ ] Can redirect to Keycloak
- [ ] Can login with test user
- [ ] Can see user info on home page
- [ ] Can logout successfully
- [ ] Protected routes redirect to login when not authenticated

## Next Steps After Successful Auth

Once authentication is working:

1. Implement tenant selection/creation flow
2. Fetch tenant data from backend API
3. Store tenant in auth store
4. Add tenant context to all API requests
5. Implement dashboard layout
6. Add plugin management UI

---

**Created**: January 13, 2026
**Status**: Authentication integration complete, ready for testing
