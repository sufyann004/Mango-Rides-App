# Firebase Setup Guide

This guide will help you set up your own Firebase project to run the Mango Rides app.

## Prerequisites

- A Google account
- Node.js and npm installed
- Expo CLI installed (`npm install -g expo-cli`)
- Firebase CLI installed (`npm install -g firebase-tools`)

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter your project name (e.g., "mango-rides-yourname")
4. Follow the setup wizard:
   - Enable/disable Google Analytics (optional)
   - Select your Analytics account if enabled
5. Click "Create project"

## Step 2: Enable Authentication

1. In your Firebase project, go to **Build > Authentication**
2. Click "Get started"
3. Go to the **Sign-in method** tab
4. Enable **Email/Password** authentication
5. Click "Save"

## Step 3: Create Firestore Database

1. Go to **Build > Firestore Database**
2. Click "Create database"
3. Choose **Start in production mode** (we'll add security rules later)
4. Select a location close to your users
5. Click "Enable"

## Step 4: Set Up Firestore Security Rules

1. In Firestore Database, go to the **Rules** tab
2. Replace the default rules with the content from `firestore.rules` file in this project
3. Click "Publish"

## Step 5: Set Up Firestore Indexes

1. In your project root, make sure you're logged into Firebase CLI:
   ```bash
   firebase login
   ```

2. Initialize Firebase in your project (if not already done):
   ```bash
   firebase init
   ```
   - Select "Firestore" from the options
   - Choose your existing Firebase project
   - Accept default files for rules and indexes

3. Replace the content of `firestore.indexes.json` with the one from this project

4. Deploy the indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

## Step 6: Register Your App

1. In Firebase Console, go to **Project Overview**
2. Click the **Web** icon (</>) to add a web app
3. Register your app with a nickname (e.g., "Mango Rides App")
4. **Don't check** "Also set up Firebase Hosting"
5. Click "Register app"
6. Copy the Firebase configuration object (firebaseConfig)

## Step 7: Get API Keys

### MapTiler API Key
1. Go to [MapTiler Cloud](https://cloud.maptiler.com/)
2. Sign up or log in
3. Go to **Account > Keys**
4. Copy your API key or create a new one

### Geoapify API Key
1. Go to [Geoapify](https://www.geoapify.com/)
2. Sign up or log in
3. Go to **Projects > Your Project > API Keys**
4. Copy your API key

### EmailJS Configuration
1. Go to [EmailJS](https://www.emailjs.com/)
2. Sign up or log in
3. Create an email service (Gmail, Outlook, etc.)
4. Create an email template for ride notifications
5. Go to **Account** to find your Public Key
6. Note your Service ID and Template ID

## Step 8: Configure the App

1. Copy `firebase.config.example.js` to `firebase.config.js`:
   ```bash
   cp firebase.config.example.js firebase.config.js
   ```

2. Open `firebase.config.js` and replace all placeholders:

```javascript
export const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

export const MAPTILER_KEY = "YOUR_MAPTILER_API_KEY";
export const GEOAPIFY_KEY = "YOUR_GEOAPIFY_API_KEY";

export const EMAILJS_CONFIG = {
  serviceId: 'YOUR_EMAILJS_SERVICE_ID',
  templateId: 'YOUR_EMAILJS_TEMPLATE_ID',
  publicKey: 'YOUR_EMAILJS_PUBLIC_KEY'
};
```

## Step 9: Install Dependencies

```bash
npm install
```

## Step 10: Run the App

For development:
```bash
npm start
```

For Android:
```bash
npm run android
```

For iOS:
```bash
npm run ios
```

## Firestore Collections Structure

The app will automatically create these collections as users interact with the app:

### `drivers` Collection
- **Document ID**: Firebase Auth UID
- **Fields**:
  - `email`: string
  - `name`: string
  - `phone`: string
  - `cnicNumber`: string
  - `vehicleType`: string (Bike, Hatchback, Sedan)
  - `vehicleModel`: string
  - `licensePlate`: string
  - `hasAC`: boolean
  - `category`: string (kairi, anwar_ratol, langra, sindhiri)
  - `available`: boolean
  - `location`: object { latitude, longitude }
  - `currentRideId`: string (optional)
  - `rating`: number (optional)
  - `totalRides`: number (optional)

### `riders` Collection
- **Document ID**: Firebase Auth UID
- **Fields**:
  - `email`: string
  - `name`: string
  - `phone`: string
  - `currentRideId`: string (optional)
  - `rating`: number (optional)
  - `totalRides`: number (optional)

### `bookings` Collection
- **Document ID**: Auto-generated
- **Fields**:
  - `riderId`: string (reference to riders)
  - `driverId`: string (reference to drivers, optional)
  - `pickupLocation`: object { latitude, longitude, address }
  - `dropoffLocation`: object { latitude, longitude, address }
  - `category`: string (kairi, anwar_ratol, langra, sindhiri)
  - `fare`: number
  - `distance`: number (in km)
  - `status`: string (pending, accepted, started, completed, cancelled)
  - `timestamp`: timestamp
  - `driverLocation`: object { latitude, longitude } (optional)
  - `rating`: number (optional)
  - `review`: string (optional)

### `bookings/{bookingId}/messages` Subcollection
- **Document ID**: Auto-generated
- **Fields**:
  - `senderId`: string
  - `senderName`: string
  - `message`: string
  - `timestamp`: timestamp

### `mail` Collection (for email notifications)
- **Document ID**: Auto-generated
- **Fields**:
  - `to`: array of strings (email addresses)
  - `message`: object { subject, text, html }
  - `delivery`: object (managed by Firebase extension)

## Troubleshooting

### Authentication Errors
- Verify Email/Password authentication is enabled
- Check if the Firebase configuration is correct

### Firestore Permission Denied
- Make sure Firestore security rules are deployed
- Verify user is authenticated before accessing data

### Map Not Showing
- Verify MapTiler API key is correct and has no restrictions
- Check if location permissions are granted

### Email Notifications Not Sending
- Verify EmailJS configuration is correct
- Check EmailJS service status
- Make sure email template exists

## Important Security Notes

1. **Never commit `firebase.config.js`** to version control
2. Keep your API keys secure
3. Use environment variables for production builds
4. Regularly rotate your API keys
5. Set up billing alerts in Firebase Console
6. Monitor your Firebase usage dashboard

## Additional Configuration

### Firebase Extensions

To enable automatic email sending via Firestore, install the "Trigger Email" extension:

1. Go to **Extensions** in Firebase Console
2. Search for "Trigger Email from Firestore"
3. Install and configure with your email service (SendGrid, Mailgun, etc.)

### Production Deployment

Before deploying to production:

1. Update Firestore security rules for production
2. Set up proper error logging (Firebase Crashlytics)
3. Configure app signing for Android/iOS
4. Test all features thoroughly
5. Set up CI/CD pipeline

## Support

For issues or questions:
- Check Firebase documentation: https://firebase.google.com/docs
- Review Expo documentation: https://docs.expo.dev
- Open an issue in the GitHub repository

## License

This project is licensed under the MIT License - see the LICENSE file for details.
