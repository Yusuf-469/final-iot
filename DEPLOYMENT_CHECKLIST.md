# 🚀 Vercel Deployment Checklist for Medical IoT System

## Pre-Deployment Checklist

- [x] **Git Repository**: Ensure code is pushed to GitHub
- [x] **Firebase Ready**: Firebase project configured with Authentication enabled
- [x] **Environment Variables**: Firebase credentials already configured (see .env file)
- [x] **Vercel Account**: Create account at [vercel.com](https://vercel.com)

## Required Environment Variables for Vercel

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Required for Vercel |
| `JWT_SECRET` | (32+ char string) | For authentication |
| `FRONTEND_URL` | `https://healthmonitor-zeta.vercel.app` | Your Vercel URL |
| `FIREBASE_PROJECT_ID` | `iothealth-2335a` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | (Firebase service account key) | Firebase admin credentials |
| `FIREBASE_CLIENT_EMAIL` | firebase-adminsdk-fbsvc@iothealth-2335a.iam.gserviceaccount.com | Firebase service account email |

## Optional Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID | Push notifications |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | Firebase auth |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account | Firebase auth |
| `SMTP_HOST` | `smtp.gmail.com` | Email alerts |
| `SMTP_USER` | Your email | Email sender |
| `SMTP_PASS` | App password | Email auth |
| `TWILIO_ACCOUNT_SID` | Twilio SID | SMS alerts |
| `TWILIO_AUTH_TOKEN` | Twilio token | SMS auth |
| `LOG_LEVEL` | `info` | Logging level |

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
