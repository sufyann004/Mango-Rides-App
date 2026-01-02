# 🥭 Mango Rides - Ride Sharing Mobile App

A comprehensive ride-sharing mobile application built with React Native and Expo, featuring real-time ride matching, in-app chat, and multiple ride categories.

## 📱 Features

### For Riders
- **Real-time Ride Booking**: Request rides with live driver tracking
- **Multiple Ride Categories**: Choose from Bike, Hatchback (Non-AC), Hatchback (AC), and Sedan (AC)
- **Live Location Tracking**: Track your driver's location in real-time
- **In-App Chat**: Communicate with drivers during rides
- **Ride History**: View past rides and receipts
- **Rating System**: Rate drivers after each ride
- **Smart Fare Calculation**: Distance-based fare with category pricing

### For Drivers
- **Ride Requests**: Accept or decline ride requests
- **Navigation**: Get directions to pickup and drop-off locations
- **Earnings Dashboard**: Track your earnings and completed rides
- **Availability Toggle**: Go online/offline at your convenience
- **Rider Communication**: Chat with riders during trips
- **Rating System**: Build your reputation with rider ratings

### Ride Categories

| Category | Vehicle Type | Base Fare | Icon |
|----------|-------------|-----------|------|
| Kairi (Fast) | Bike | ₹150 - ₹450 | 🏍️ |
| Anwar Ratol (Mini) | Hatchback (Non-AC) | ₹250 - ₹700 | 🚗 |
| Langra (Go) | Hatchback (AC) | ₹350 - ₹850 | 🚗 |
| Sindhiri (Premium) | Sedan (AC) | ₹500 - ₹1400 | 🚙 |

*Fares vary based on distance (short: <10km, medium: 10-25km, long: 25-40km)*

## 🏗️ Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Stack & Drawer)
- **Backend**: Firebase
  - Authentication (Email/Password)
  - Firestore (Real-time Database)
  - Cloud Functions (Email notifications)
- **Maps**: 
  - React Native Maps
  - MapTiler (Map tiles)
  - Geoapify (Geocoding & routing)
- **State Management**: React Context API
- **UI Components**: Custom components with Expo Vector Icons
- **Notifications**: EmailJS for email notifications
- **Storage**: AsyncStorage for local persistence

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Firebase CLI](https://firebase.google.com/docs/cli)
- [Android Studio](https://developer.android.com/studio) (for Android development)
- [Xcode](https://developer.apple.com/xcode/) (for iOS development, macOS only)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/mango-rides.git
cd mango-rides/Mango_App_Final_GitHub
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Firebase

Follow the detailed instructions in [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to:
- Create a Firebase project
- Enable Authentication
- Set up Firestore database
- Configure security rules and indexes
- Get API keys

### 4. Configure Environment

1. Copy the example config file:
   ```bash
   cp firebase.config.example.js firebase.config.js
   ```

2. Open `firebase.config.js` and add your credentials:
   ```javascript
   export const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID",
     measurementId: "YOUR_MEASUREMENT_ID"
   };

   export const MAPTILER_KEY = "YOUR_MAPTILER_KEY";
   export const GEOAPIFY_KEY = "YOUR_GEOAPIFY_KEY";
   
   export const EMAILJS_CONFIG = {
     serviceId: 'YOUR_SERVICE_ID',
     templateId: 'YOUR_TEMPLATE_ID',
     publicKey: 'YOUR_PUBLIC_KEY'
   };
   ```

### 5. Run the App

**Development Mode (Expo Go):**
```bash
npm start
```

**Android:**
```bash
npm run android
```

**iOS:**
```bash
npm run ios
```

## 📁 Project Structure

```
Mango_App_Final_GitHub/
├── App.js                      # Main application file
├── firebase.config.example.js  # Firebase config template
├── firebase.config.js          # Your Firebase credentials (gitignored)
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Firestore indexes
├── FIREBASE_SETUP.md           # Detailed Firebase setup guide
├── package.json                # Dependencies
├── app.json                    # Expo configuration
├── .gitignore                  # Git ignore rules
├── android/                    # Android native code
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/
│   │       └── main/
│   │           ├── AndroidManifest.xml
│   │           └── java/
│   │               └── com/aamrides/app/
│   │                   ├── MainActivity.kt
│   │                   └── MainApplication.kt
│   └── build.gradle
├── assets/                     # App assets
└── extensions/                 # Additional extensions
```

## 🔐 Security

This repository is configured to keep your credentials safe:

- ✅ `firebase.config.js` is in `.gitignore` (never committed)
- ✅ `firebase.config.example.js` is committed (template only)
- ✅ API keys and secrets are excluded from version control
- ✅ Firestore security rules protect your database

**Important**: Never commit `firebase.config.js` or any file containing actual API keys!

## 📚 Database Schema

### Collections

#### `drivers`
```javascript
{
  email: string,
  name: string,
  phone: string,
  cnicNumber: string,
  vehicleType: "Bike" | "Hatchback" | "Sedan",
  vehicleModel: string,
  licensePlate: string,
  hasAC: boolean,
  category: "kairi" | "anwar_ratol" | "langra" | "sindhiri",
  available: boolean,
  location: { latitude: number, longitude: number },
  currentRideId?: string,
  rating?: number,
  totalRides?: number
}
```

#### `riders`
```javascript
{
  email: string,
  name: string,
  phone: string,
  currentRideId?: string,
  rating?: number,
  totalRides?: number
}
```

#### `bookings`
```javascript
{
  riderId: string,
  driverId?: string,
  pickupLocation: { latitude, longitude, address },
  dropoffLocation: { latitude, longitude, address },
  category: string,
  fare: number,
  distance: number,
  status: "pending" | "accepted" | "started" | "completed" | "cancelled",
  timestamp: Timestamp,
  driverLocation?: { latitude, longitude },
  rating?: number,
  review?: string
}
```

#### `bookings/{bookingId}/messages`
```javascript
{
  senderId: string,
  senderName: string,
  message: string,
  timestamp: Timestamp
}
```

## 🛠️ Development

### Available Scripts

```bash
npm start          # Start Expo development server
npm run android    # Run on Android device/emulator
npm run ios        # Run on iOS device/simulator
npm run web        # Run in web browser
```

### Building for Production

**Android APK:**
```bash
expo build:android
```

**iOS IPA:**
```bash
expo build:ios
```

**Using EAS Build (Recommended):**
```bash
eas build --platform android
eas build --platform ios
```

## 🐛 Troubleshooting

### Common Issues

1. **Firebase Connection Error**
   - Verify `firebase.config.js` has correct credentials
   - Check Firebase project is active

2. **Map Not Loading**
   - Verify MapTiler API key is valid
   - Check internet connection

3. **Location Permissions**
   - Enable location permissions in device settings
   - For iOS: Add location usage descriptions in `app.json`

4. **Build Errors**
   - Clear cache: `expo start -c`
   - Reinstall dependencies: `rm -rf node_modules && npm install`

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for more troubleshooting tips.



## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- Sufyan Siddiqui
- Abdul Karim

## 🙏 Acknowledgments

- Expo for the amazing React Native framework
- Firebase for backend services
- MapTiler for map tiles
- Geoapify for geocoding services
- EmailJS for email notifications


