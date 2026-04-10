# 🚀 Vercel Deployment Checklist for Medical IoT System

## 🔥 CRITICAL: Vercel Environment Variables Setup

### Required Firebase Environment Variables for Vercel Production

**YOU MUST SET THESE IN VERCEL DASHBOARD FOR THE APP TO WORK:**

1. **FIREBASE_PROJECT_ID**
   - Value: `iothealth-2335a`
   - Type: Plain text

2. **FIREBASE_PRIVATE_KEY**
   - Value: (Copy the entire private key from your `.env` file, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
   - Type: Plain text
   - **CRITICAL**: The key contains `\n` characters - copy it exactly as-is from `.env`

3. **FIREBASE_CLIENT_EMAIL**
   - Value: `firebase-adminsdk-fbsvc@iothealth-2335a.iam.gserviceaccount.com`
   - Type: Plain text

4. **FIREBASE_DATABASE_URL**
   - Value: `https://iothealth-2335a-default-rtdb.firebaseio.com`
   - Type: Plain text

5. **JWT_SECRET**
   - Value: Generate a secure random string (min 32 characters)
   - Type: Plain text

6. **FRONTEND_URL**
   - Value: `https://final-iot-delta.vercel.app`
   - Type: Plain text
   - Description: Your Vercel deployment URL for CORS configuration

6. **FRONTEND_URL**
   - Value: Your Vercel deployment URL (e.g., `https://your-project.vercel.app`)
   - Type: Plain text

### How to Set Environment Variables in Vercel:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable listed above
5. **IMPORTANT**: Set them for "Production", "Preview", and "Development" environments
6. **CRITICAL**: After adding/changing env vars, you must **redeploy** for them to take effect

### Verify Environment Variables are Working:

After deployment, check Vercel function logs. You should see:
```
🔍 Firebase Environment Check:
  VERCEL_ENV: production
  FIREBASE_PROJECT_ID: (set)
  FIREBASE_PRIVATE_KEY: (set, length: 1704)
  FIREBASE_CLIENT_EMAIL: (set)
  FIREBASE_DATABASE_URL: (set)
✅ Firebase Admin SDK initialized successfully
✅ Firebase Realtime Database initialized
```

**If you see "NOT SET" for any variable, all API routes will return 500 errors.**

## Pre-Deployment Checklist

- [x] **Git Repository**: Code pushed to GitHub
- [x] **Firebase Ready**: RTDB enabled, service account created
- [x] **Environment Variables**: Set in Vercel dashboard (see above)
- [x] **Vercel Project**: Connected to GitHub repository

## 🚀 Deployment Steps

### Option 1: Vercel Dashboard (Recommended)

1. **Create New Project**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project" → "Import Git Repository"
   - Select your repository

2. **Configure Variables** (Firebase credentials are already in .env):
   - Go to "Variables" tab
   - Add:
     ```
     NODE_ENV=production
     JWT_SECRET=your-super-secret-key-here
     FRONTEND_URL=https://your-project-name.railway.app
     ```

4. **Deploy**:
   - Railway auto-detects `Procfile` and `package.json`
   - Click "Deploy" and wait for build

5. **Verify**:
   - Visit `https://your-project-name.railway.app/health`
   - Should return `{"status":"healthy"}`

### Option 2: Railway CLI

```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
railway init

# 4. Set required variables (Firebase credentials are already configured)
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=your-secret-key
railway variables set FRONTEND_URL=https://your-app.railway.app

# 6. Deploy
railway up

# 7. View logs
railway logs
```

## 🔧 Post-Deployment Configuration

1. **Update ESP32 Firmware**:
   - Change `SERVER_URL` in `hardware/esp32_health_monitor/esp32_health_monitor.ino`:
   ```cpp
   const char* SERVER_URL = "https://your-app.railway.app/api/health-data";
   ```

2. **Test the System**:
   - Health check: `https://your-app.railway.app/health`
   - API status: `https://your-app.railway.app/api/status`
   - Dashboard: `https://your-app.railway.app`

## 📋 Quick Reference

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Health Check | `https://your-app.railway.app/health` | Server status |
| API Base | `https://your-app.railway.app/api` | All API endpoints |
| Dashboard | `https://your-app.railway.app` | Web interface |

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| App won't start | Check `railway logs` for errors |
| Database not connecting | Verify `MONGODB_URI` or add MongoDB plugin |
| CORS errors | Update `FRONTEND_URL` variable |
| 500 Error | Check environment variables are set |
| Static files not loading | Ensure `frontend/` directory exists |

## 📞 Support

- Railway Docs: https://docs.railway.app
- MongoDB Atlas: https://docs.atlas.mongodb.com
- Project Issues: GitHub Issues

---

**✅ Deployment Complete!** Your Medical IoT system is now running on Railway.
