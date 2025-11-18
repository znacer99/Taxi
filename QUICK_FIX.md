# 🚨 QUICK FIX - Maps Issue

## The Problem:
- `react-native-maps` requires native modules
- Expo Go doesn't support it without a custom development build

## Quick Solution (2 options):

### Option 1: Use Simple Version (NO MAPS - Works Now!)

I created simple versions without maps. Update `app/index.tsx`:

```typescript
// Change line 3-4 from:
import DriverApp from '../DriverApp';
import PassengerApp from '../PassengerApp';

// To:
import DriverApp from '../DriverApp.simple';
import PassengerApp from '../PassengerApp.simple';
```

Then reload the app!

### Option 2: Build Custom Development Client (Takes 20 min)

```bash
cd /workspaces/Taxi/RukoGo
npx expo prebuild
eas build --profile development --platform android
```

Then install the custom build on your phone.

---

## ✅ RECOMMENDED: Use Option 1 for now!

The simple version has all features EXCEPT maps:
- ✅ Login/Register
- ✅ Request rides
- ✅ Accept rides
- ✅ Complete rides
- ✅ WebSocket updates
- ✅ Location tracking
- ❌ Map display (shows coordinates instead)

---

## To Apply Option 1:

1. **Stop Expo** (Ctrl+C)

2. **Edit file:**
```bash
nano /workspaces/Taxi/RukoGo/app/index.tsx
```

3. **Change imports** (lines 3-4):
```typescript
import DriverApp from '../DriverApp.simple';
import PassengerApp from '../PassengerApp.simple';
```

4. **Save** (Ctrl+X, Y, Enter)

5. **Restart Expo:**
```bash
cd /workspaces/Taxi/RukoGo
npx expo start --tunnel -c
```

6. **Scan QR code** again!

---

## OR Use This One-Liner:

```bash
cd /workspaces/Taxi/RukoGo && sed -i "s/DriverApp';/DriverApp.simple';/g; s/PassengerApp';/PassengerApp.simple';/g" app/index.tsx && npx expo start --tunnel -c
```

---

**Sorry for the confusion! This will work now! 🚕**
