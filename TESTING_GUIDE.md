# Taxi App - Testing Guide

## Testing in Gitpod Environment

Since your local machine is too old, you can test everything right here in Gitpod!

---

## 🚀 QUICK START

### 1. Start the Django Backend

Open a terminal and run:

```bash
cd /workspaces/Taxi/uber_django
python manage.py runserver 0.0.0.0:8000
```

The backend will be available at the Gitpod URL (Gitpod will show you the URL).

### 2. Start the React Native App with Tunnel

Open a **NEW terminal** (don't close the backend) and run:

```bash
cd /workspaces/Taxi/RukoGo
npx expo start --tunnel
```

The `--tunnel` flag creates a public URL that works from anywhere!

### 3. Scan QR Code on Your Phone

1. Install **Expo Go** app on your phone:
   - iOS: https://apps.apple.com/app/expo-go/id982107779
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent

2. Open Expo Go and scan the QR code shown in the terminal

3. The app will load on your phone!

---

## 📱 TESTING ON YOUR PHONE

### Option 1: Using Expo Tunnel (RECOMMENDED)

This is the easiest way since your local machine is old:

```bash
# Terminal 1: Backend
cd /workspaces/Taxi/uber_django
python manage.py runserver 0.0.0.0:8000

# Terminal 2: Frontend
cd /workspaces/Taxi/RukoGo
npx expo start --tunnel
```

**Important:** You need to update the API URL in the app to use the Gitpod backend URL.

### Option 2: Using ngrok (Alternative)

If tunnel doesn't work, use ngrok:

```bash
# Terminal 1: Backend
cd /workspaces/Taxi/uber_django
python manage.py runserver 0.0.0.0:8000

# Terminal 2: ngrok
ngrok http 8000

# Terminal 3: Frontend
cd /workspaces/Taxi/RukoGo
# Update config/api.js with ngrok URL
npx expo start --tunnel
```

---

## ⚙️ CONFIGURATION

### Update API URL for Gitpod

Before starting, update the API URL:

**Option A: Using app.json (Recommended)**

Edit `RukoGo/app.json`:
```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://8000-YOUR-GITPOD-URL.gitpod.io"
    }
  }
}
```

**Option B: Using config/api.js**

Edit `RukoGo/config/api.js` line 30:
```javascript
// Replace with your Gitpod backend URL
return 'https://8000-YOUR-GITPOD-URL.gitpod.io';
```

### Get Your Gitpod Backend URL

1. Start the Django backend: `python manage.py runserver 0.0.0.0:8000`
2. Gitpod will show a popup with the URL
3. Or check the PORTS tab in Gitpod
4. Copy the URL (should look like: `https://8000-username-taxi-xxxxx.gitpod.io`)

---

## 🧪 TESTING CHECKLIST

### Backend Tests

```bash
cd /workspaces/Taxi/uber_django

# Run all tests
python manage.py test

# Run specific test files
python manage.py test tests.test_status_values
python manage.py test tests.test_critical_fixes

# Run with verbose output
python manage.py test -v 2
```

### Frontend Manual Testing

#### Passenger App Testing:

1. **Registration**
   - [ ] Open app, select Passenger mode
   - [ ] Click "Register"
   - [ ] Fill in: username, email, password, phone
   - [ ] Submit registration
   - [ ] Should show success message

2. **Login**
   - [ ] Enter username and password
   - [ ] Click "Login"
   - [ ] Should navigate to home screen

3. **Request Ride**
   - [ ] Click "Use Current Location" for pickup
   - [ ] Enter dropoff coordinates manually (or use map)
   - [ ] Enter pickup and dropoff addresses
   - [ ] Click "Request Ride"
   - [ ] Should show "Searching for driver..."

4. **Active Ride**
   - [ ] Should see ride status update in real-time
   - [ ] Map should show pickup and dropoff markers
   - [ ] Can cancel ride

5. **Ride History**
   - [ ] Click "Show Ride History"
   - [ ] Should see completed/cancelled rides
   - [ ] Should show fare amounts

#### Driver App Testing:

1. **Registration**
   - [ ] Open app, select Driver mode
   - [ ] Click "Register"
   - [ ] Fill in: username, email, password, phone, car model, car plate
   - [ ] Submit registration

2. **Login**
   - [ ] Enter credentials
   - [ ] Should navigate to dashboard

3. **Go Online**
   - [ ] Toggle availability to "Available"
   - [ ] Should see green status
   - [ ] Location should update automatically

4. **Accept Ride**
   - [ ] Wait for ride request (or create one from passenger app)
   - [ ] Should receive ride notification
   - [ ] Click "Accept Ride"
   - [ ] Status should change to "Accepted"

5. **Complete Ride Flow**
   - [ ] Click "Start Ride"
   - [ ] Status should change to "In Progress"
   - [ ] Click "Complete Ride"
   - [ ] Should see fare amount
   - [ ] Should return to dashboard

6. **Earnings**
   - [ ] Should see total earnings
   - [ ] Should see total rides
   - [ ] Should see average per ride

---

## 🐛 TROUBLESHOOTING

### Backend Issues

**Problem: Backend won't start**
```bash
# Check if port is in use
lsof -i :8000

# Kill process if needed
kill -9 <PID>

# Try again
python manage.py runserver 0.0.0.0:8000
```

**Problem: Database errors**
```bash
# Run migrations
python manage.py migrate

# Create superuser if needed
python manage.py createsuperuser
```

**Problem: CORS errors**
```bash
# Check CORS settings in uber_django/uber_backend/settings.py
# Should have:
CORS_ALLOW_ALL_ORIGINS = True  # For development only
```

### Frontend Issues

**Problem: Can't connect to backend**
- Check API URL in `config/api.js` or `app.json`
- Make sure backend is running
- Check Gitpod URL is correct
- Try accessing backend URL in browser first

**Problem: Expo tunnel not working**
```bash
# Try without tunnel first
npx expo start

# Or use LAN
npx expo start --lan

# Clear cache
npx expo start -c
```

**Problem: App crashes on startup**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npx expo start -c
```

**Problem: Location not working**
- Make sure you granted location permissions
- Check if GPS is enabled on phone
- Try restarting the app

**Problem: WebSocket not connecting**
- Check backend WebSocket URL
- Make sure token is valid
- Check browser console for errors
- Verify backend is running

---

## 📊 TESTING SCENARIOS

### Scenario 1: Complete Ride Flow

1. **Setup:**
   - Start backend
   - Start frontend with tunnel
   - Open passenger app on Phone 1
   - Open driver app on Phone 2 (or use web browser)

2. **Execute:**
   - Driver: Login and go online
   - Passenger: Login and request ride
   - Driver: Should receive ride request
   - Driver: Accept ride
   - Driver: Start ride
   - Driver: Complete ride

3. **Verify:**
   - Passenger sees all status updates
   - Driver sees fare amount
   - Payment is created
   - Driver earnings updated
   - Ride appears in history

### Scenario 2: Concurrent Ride Requests

1. **Setup:**
   - 2 passengers
   - 1 driver online

2. **Execute:**
   - Both passengers request rides simultaneously

3. **Verify:**
   - Only one passenger gets assigned the driver
   - Other passenger stays in "Requested" state
   - No double-booking occurs

### Scenario 3: Ride Cancellation

1. **Execute:**
   - Passenger requests ride
   - Driver accepts
   - Passenger cancels

2. **Verify:**
   - Driver becomes available again
   - Ride status is "Cancelled"
   - Appears in history

### Scenario 4: Network Failure Recovery

1. **Execute:**
   - Start a ride
   - Turn off WiFi/data on phone
   - Wait 10 seconds
   - Turn WiFi/data back on

2. **Verify:**
   - App reconnects automatically
   - Ride status is still correct
   - No data loss

---

## 🔍 MONITORING

### Backend Logs

```bash
# Watch Django logs
cd /workspaces/Taxi/uber_django
python manage.py runserver 0.0.0.0:8000

# You'll see:
# - API requests
# - WebSocket connections
# - Database queries
# - Errors
```

### Frontend Logs

```bash
# Expo logs
npx expo start --tunnel

# You'll see:
# - API calls
# - WebSocket messages
# - Component renders
# - Errors
```

### Database Inspection

```bash
cd /workspaces/Taxi/uber_django

# Open Django shell
python manage.py shell

# Check rides
from rides.models import Ride
Ride.objects.all()

# Check drivers
from rides.models import DriverProfile
DriverProfile.objects.filter(is_available=True)

# Check payments
from rides.models import Payment
Payment.objects.all()
```

---

## 📈 PERFORMANCE TESTING

### Load Testing Backend

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test login endpoint
ab -n 100 -c 10 -p login.json -T application/json \
  https://8000-YOUR-GITPOD-URL.gitpod.io/api/auth/login/

# Test ride list endpoint (with auth)
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_TOKEN" \
  https://8000-YOUR-GITPOD-URL.gitpod.io/api/rides/
```

### Monitor App Performance

On your phone:
1. Open Expo Go
2. Shake device to open dev menu
3. Enable "Performance Monitor"
4. Watch FPS and memory usage

---

## ✅ ACCEPTANCE CRITERIA

### Must Pass Before Production:

- [ ] All backend tests pass
- [ ] Passenger can register and login
- [ ] Driver can register and login
- [ ] Passenger can request ride
- [ ] Driver receives ride request
- [ ] Driver can accept ride
- [ ] Driver can complete ride
- [ ] Payment is created correctly
- [ ] Earnings are calculated correctly
- [ ] WebSocket updates work in real-time
- [ ] Location tracking works
- [ ] Maps display correctly
- [ ] Ride history shows correctly
- [ ] Cancellation works
- [ ] No crashes during normal use
- [ ] Network failure recovery works
- [ ] No race conditions in driver assignment
- [ ] No duplicate payments

---

## 🚀 DEPLOYMENT TESTING

### Staging Environment

Before production, test on staging:

1. Deploy backend to staging server
2. Update frontend API URL to staging
3. Build production app: `expo build:android` / `expo build:ios`
4. Test with real users
5. Monitor errors and performance
6. Fix issues
7. Repeat until stable

---

## 📞 NEED HELP?

### Common Commands Reference

```bash
# Backend
cd /workspaces/Taxi/uber_django
python manage.py runserver 0.0.0.0:8000
python manage.py test
python manage.py migrate
python manage.py createsuperuser

# Frontend
cd /workspaces/Taxi/RukoGo
npm install
npx expo start --tunnel
npx expo start -c  # Clear cache
npx expo doctor  # Check for issues

# Git
git status
git log --oneline -5
git branch -a
```

### Documentation

- Backend fixes: `/uber_django/tests/test_*.py`
- Frontend fixes: `/RukoGo/FIXES_APPLIED.md`
- Overall summary: `/FIXES_SUMMARY.md`
- API config: `/RukoGo/config/api.js`

---

## 🎉 READY TO TEST!

**Quick Start Commands:**

```bash
# Terminal 1: Backend
cd /workspaces/Taxi/uber_django && python manage.py runserver 0.0.0.0:8000

# Terminal 2: Frontend  
cd /workspaces/Taxi/RukoGo && npx expo start --tunnel
```

Then scan the QR code with Expo Go on your phone!

**Good luck! 🚕📱**
