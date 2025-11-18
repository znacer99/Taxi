# 🚀 RUN THE APP NOW - SIMPLE STEPS

## ✅ Backend is ALREADY RUNNING!

Your Django backend is live at:
```
https://8000--019a96d3-b3a0-7638-8756-3147d29de32d.eu-central-1-01.gitpod.dev
```

Test it: https://8000--019a96d3-b3a0-7638-8756-3147d29de32d.eu-central-1-01.gitpod.dev/api/

---

## 📱 START THE MOBILE APP

### Step 1: Open a NEW Terminal in Gitpod

Click the **+** button next to your current terminal to open a new one.

### Step 2: Run These Commands

```bash
cd /workspaces/Taxi/RukoGo
npx expo start --tunnel
```

### Step 3: Wait for QR Code

You'll see something like this:

```
Starting project at /workspaces/Taxi/RukoGo
Tunnel ready.

› Metro waiting on exp://xxx.xxx.xxx.xxx:8081

› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
› Press ? │ show all commands
```

### Step 4: Scan QR Code with Your Phone

1. **Install Expo Go** on your phone first:
   - **Android**: https://play.google.com/store/apps/details?id=host.exp.exponent
   - **iOS**: https://apps.apple.com/app/expo-go/id982107779

2. **Open Expo Go** app

3. **Scan the QR code** shown in the terminal

4. **Wait** - The app will download and open on your phone!

---

## 🎯 THAT'S IT!

The app will load on your phone and connect to the backend running in Gitpod!

---

## 🐛 TROUBLESHOOTING

### If tunnel doesn't work:

Try without tunnel (only works if phone is on same network):
```bash
cd /workspaces/Taxi/RukoGo
npx expo start --lan
```

### If you see "Port already in use":

Kill the old process:
```bash
pkill -f "expo start"
npx expo start --tunnel
```

### If app crashes on phone:

Clear cache and restart:
```bash
npx expo start --tunnel -c
```

---

## 📋 WHAT TO TEST

Once the app loads on your phone:

### Test Passenger App:
1. Click "Register" 
2. Fill in details (username, email, password, phone)
3. Login
4. Request a ride (enter coordinates manually for now)
5. See ride status updates

### Test Driver App:
1. Register as driver (need car model and plate)
2. Login
3. Toggle "Available"
4. Wait for ride requests
5. Accept, start, and complete rides

---

## 🎉 YOU'RE READY!

Your backend is running, all bugs are fixed, and you just need to:

1. Open new terminal
2. Run `npx expo start --tunnel`
3. Scan QR code with Expo Go
4. Test the app!

**Good luck! 🚕📱**
