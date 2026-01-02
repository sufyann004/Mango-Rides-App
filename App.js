import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { 
  StyleSheet, 
  Text as RNText,       // <--- Renamed
  View, 
  TouchableOpacity, 
  TextInput as RNTextInput, // <--- Renamed
  ScrollView, 
  StatusBar, 
  Image, 
  ActivityIndicator, 
  Alert, 
  FlatList, 
  Animated, 
  Keyboard, 
  Modal, 
  Platform, 
  KeyboardAvoidingView, 
  TouchableWithoutFeedback 
} from 'react-native';


const Text = (props) => {
  const { numberOfLines, style, ...otherProps } = props;

  
  return (
    <RNText 
      {...otherProps} 
      allowFontScaling={false} 
      style={[
        style, 
        { 
          flexShrink: 1,   
          flexWrap: 'wrap' 
        }
      ]} 
    />
  );
};

const TextInput = (props) => (
  <RNTextInput 
    {...props} 
    allowFontScaling={false} 
    style={[props.style, { flexShrink: 1 }]} 
  />
);
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { UrlTile, Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Feather, FontAwesome5, MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, onSnapshot, doc, updateDoc, setDoc, arrayUnion, orderBy, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { createDrawerNavigator } from '@react-navigation/drawer';
import emailjs from '@emailjs/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';
import { firebaseConfig, MAPTILER_KEY, GEOAPIFY_KEY, EMAILJS_CONFIG } from './firebase.config';

// FIREBASE INITIALIZATION
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
const db = getFirestore(app);
emailjs.init(EMAILJS_CONFIG.publicKey);

// COLORS
const COLORS = { 
  primary: '#FF8C00', 
  secondary: '#FFB347', 
  white: '#FFFFFF', 
  black: '#1A1A1A', 
  gray: '#8E8E93', 
  lightGray: '#F2F2F7', 
  green: '#34C759', 
  red: '#FF3B30',
  yellow: '#FFCC00',
  background: '#FAFAFA',
  blue: '#007AFF'
};

// RIDE CATEGORIES
const CATEGORIES = {
  BIKE: { 
    id: 'kairi', 
    name: 'Kairi (Fast)', 
    displayName: 'Bike',
    icon: 'motorcycle',
    pricing: { short: 150, medium: 300, long: 450 }
  },
  MINI: { 
    id: 'anwar_ratol', 
    name: 'Anwar Ratol (Mini)', 
    displayName: 'Hatchback (Non-AC)',
    icon: 'car',
    pricing: { short: 250, medium: 450, long: 700 }
  },
  GO: { 
    id: 'langra', 
    name: 'Langra (Go)', 
    displayName: 'Hatchback (AC)',
    icon: 'car',
    pricing: { short: 350, medium: 600, long: 850 }
  },
  PREMIUM: { 
    id: 'sindhiri', 
    name: 'Sindhiri (Premium)', 
    displayName: 'Sedan (AC)',
    icon: 'car',
    pricing: { short: 500, medium: 1000, long: 1400 }
  }
};

const getVehicleCategory = (vehicleType, hasAC) => {
  if (vehicleType === 'Bike') return CATEGORIES.BIKE;
  if (vehicleType === 'Hatchback' && !hasAC) return CATEGORIES.MINI;
  if (vehicleType === 'Hatchback' && hasAC) return CATEGORIES.GO;
  if (vehicleType === 'Sedan') return CATEGORIES.PREMIUM;
  return CATEGORIES.MINI;
};

const calculateFare = (distanceKm, categoryId) => {
  const distance = parseFloat(distanceKm);
  if (distance > 40) return null;
  
  const category = Object.values(CATEGORIES).find(c => c.id === categoryId);
  if (!category) return 200;
  
  if (distance < 10) return category.pricing.short;
  if (distance <= 25) return category.pricing.medium;
  return category.pricing.long;
};

// CALCULATE ROAD DISTANCE USING GEOAPIFY ROUTING API
const calculateRoadDistance = async (pickup, dropoff) => {
  try {
    const response = await fetch(
      `https://api.geoapify.com/v1/routing?waypoints=${pickup.latitude},${pickup.longitude}|${dropoff.latitude},${dropoff.longitude}&mode=drive&apiKey=${GEOAPIFY_KEY}`
    );
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const distanceMeters = data.features[0].properties.distance;
      const distanceKm = (distanceMeters / 1000).toFixed(1);
      
      // Get route coordinates for polyline
      const coordinates = data.features[0].geometry.coordinates[0].map(coord => ({
        latitude: coord[1],
        longitude: coord[0]
      }));
      
      return { distance: distanceKm, route: coordinates };
    }
    
    // Fallback to straight-line distance
    const distanceMeters = getDistance(
      { latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: dropoff.latitude, longitude: dropoff.longitude }
    );
    return { 
      distance: (distanceMeters / 1000).toFixed(1), 
      route: [pickup, dropoff] 
    };
    
  } catch (error) {
    console.log("Road distance error:", error);
    // Fallback
    const distanceMeters = getDistance(
      { latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: dropoff.latitude, longitude: dropoff.longitude }
    );
    return { 
      distance: (distanceMeters / 1000).toFixed(1), 
      route: [pickup, dropoff] 
    };
  }
};

// Simple distance fallback
const getDistance = (from, to) => {
  const R = 6371e3;
  const φ1 = from.latitude * Math.PI / 180;
  const φ2 = to.latitude * Math.PI / 180;
  const Δφ = (to.latitude - from.latitude) * Math.PI / 180;
  const Δλ = (to.longitude - from.longitude) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

// EMAIL TEMPLATES
const sendEmailNotification = async (to, subject, templateData) => {
  try {
    await addDoc(collection(db, "mail"), {
      to: to,
      message: {
        subject: subject,
        html: generateEmailTemplate(templateData)
      },
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.log("Email send error:", error);
  }
};

const generateEmailTemplate = (data) => {
  const { type, name, email } = data;
  
  const baseStyle = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
      <div style="background: linear-gradient(135deg, #FF8C00, #FFB347); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px;">Aam Rides</h1>
        <p style="color: #FFF8E1; margin: 5px 0 0 0;">Apni Ride, Bas Ek Click Pe</p>
      </div>
  `;
  
  const footer = `
      <div style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px; margin: 0;">© 2024 Aam Rides. All rights reserved.</p>
      </div>
    </div>
  `;

  if (type === 'rider_welcome') {
    return baseStyle + `
      <div style="padding: 30px;">
        <h2 style="color: #FF8C00;">Welcome to Aam Rides, ${name}</h2>
        <p style="color: #333; line-height: 1.6;">Your account has been successfully created.</p>
        <p style="color: #333; line-height: 1.6;">You can now book rides instantly across the city.</p>
      </div>
    ` + footer;
  }
  
  if (type === 'driver_application') {
    return baseStyle + `
      <div style="padding: 30px;">
        <h2 style="color: #FF8C00;">Application Received</h2>
        <p style="color: #333; line-height: 1.6;">Dear ${name},</p>
        <p style="color: #333; line-height: 1.6;">Thank you for applying to become an Aam Rides Captain. Your application is under review.</p>
        <div style="background: #FFF8E1; padding: 15px; border-left: 4px solid #FF8C00; margin: 20px 0;">
          <p style="margin: 0; color: #666;"><strong>Email:</strong> ${email}</p>
        </div>
      </div>
    ` + footer;
  }
  
  if (type === 'driver_approved') {
    return baseStyle + `
      <div style="padding: 30px;">
        <h2 style="color: #34C759;">Congratulations</h2>
        <p style="color: #333; line-height: 1.6;">Dear ${name},</p>
        <p style="color: #333; line-height: 1.6;">Your application has been approved. You can now start accepting rides.</p>
      </div>
    ` + footer;
  }
  
  if (type === 'driver_rejected') {
    return baseStyle + `
      <div style="padding: 30px;">
        <h2 style="color: #FF3B30;">Application Update</h2>
        <p style="color: #333; line-height: 1.6;">Dear ${name},</p>
        <p style="color: #333; line-height: 1.6;">Unfortunately, we are unable to approve your application at this time.</p>
      </div>
    ` + footer;
  }

  return baseStyle + `<div style="padding: 30px;"><p>Email from Aam Rides</p></div>` + footer;
};

// AUTH CONTEXT
const AuthContext = createContext();
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);

  // New function to manually check role after signup
  const refreshUserRole = async (uid) => {
    if (!uid) return;
    
    // Check Driver Collection
    const driverDoc = await getDoc(doc(db, "drivers", uid));
    if (driverDoc.exists()) {
      setUserRole('driver');
      return;
    }
    
    // Check Rider Collection
    const riderDoc = await getDoc(doc(db, "riders", uid));
    if (riderDoc.exists()) {
      setUserRole('rider');
      return;
    }
    
    // If neither exists yet, keep role as null (don't default to rider!)
    setUserRole(null);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await refreshUserRole(u.uid);
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Pass refreshUserRole to the rest of the app
  return (
    <AuthContext.Provider value={{ user, userRole, refreshUserRole }}>
      {children}
    </AuthContext.Provider>
  );
};

// 1. WELCOME SCREEN
function WelcomeScreen({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true })
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#FF8C00', '#FFAA00', '#FFC837']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.centerContent}>
        <Animated.View style={{ 
          opacity: fadeAnim, 
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }], 
          alignItems: 'center' 
        }}>
          <View style={styles.logoContainerShadow}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('./assets/aam.png')} 
                style={styles.logoImage} 
                resizeMode="contain" 
              />
            </View>
          </View>
          <Text style={styles.title}>Aam Rides</Text>
          <Text style={styles.slogan}>Apni Ride, Bas Ek Click Pe</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.bottomArea, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity 
          style={styles.whiteBtn} 
          activeOpacity={0.9} 
          onPress={() => navigation.navigate('Auth', { mode: 'driver' })}
        >
          <MaterialCommunityIcons name="briefcase" size={22} color={COLORS.primary} style={{marginRight: 10}} />
          <Text style={styles.orangeText}>Start Career (Driver)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.glassBtn} 
          activeOpacity={0.8} 
          onPress={() => navigation.navigate('Auth', { mode: 'rider' })}
        >
          <MaterialIcons name="location-on" size={22} color="white" style={{marginRight: 10}} />
          <Text style={styles.whiteBtnText}>Get a Ride</Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

// 2. AUTH SCREEN
function AuthScreen({ route, navigation }) {
  const { mode } = route.params;
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [address, setAddress] = useState('');
  
  const [cnic, setCnic] = useState('');
  const [vehicleType, setVehicleType] = useState('Hatchback');
  const [hasAC, setHasAC] = useState(false);
  const [licensePlate, setLicensePlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [driverPhoto, setDriverPhoto] = useState(null);
  const [vehiclePhoto, setVehiclePhoto] = useState(null);

  const pickImage = async (type) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === 'driver') setDriverPhoto(base64Img);
      else setVehiclePhoto(base64Img);
    }
  };

  const validateFields = () => {
    if (!email || !password) {
      Alert.alert("Error", "Email and password are required");
      return false;
    }

    if (isSignUp) {
      if (!name || !phone || !age || !address) {
        Alert.alert("Error", "Please fill all required fields");
        return false;
      }

      if (password !== retypePassword) {
        Alert.alert("Error", "Passwords do not match");
        return false;
      }

      if (password.length < 6) {
        Alert.alert("Error", "Password must be at least 6 characters");
        return false;
      }

      if (mode === 'driver') {
        if (!cnic || !licensePlate || !make || !model) {
          Alert.alert("Error", "Please fill all vehicle details");
          return false;
        }
        if (!driverPhoto || !vehiclePhoto) {
          Alert.alert("Error", "Please upload driver and vehicle photos");
          return false;
        }
      }
    }

    return true;
  };
// Add this line inside AuthScreen, before the handleAuth function
const { refreshUserRole } = useContext(AuthContext);
  const handleAuth = async () => {
    // 1. Validate Input
    if (!validateFields()) return;
    
    Keyboard.dismiss();
    setLoading(true);

    try {
      if (isSignUp) {
        // --- SIGN UP FLOW ---
        
        // A. Create Authentication User
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;

        const baseData = {
          uid,
          name,
          email,
          phone,
          age: parseInt(age),
          address,
          createdAt: serverTimestamp()
        };

        if (mode === 'driver') {
          // --- DRIVER REGISTRATION ---
          const category = getVehicleCategory(vehicleType, hasAC);
          
          // B1. Save Driver Data to Firestore
          // We MUST await this so the document exists before the app tries to read it
          await setDoc(doc(db, "drivers", uid), {
            ...baseData,
            cnic,
            vehicleType,
            hasAC,
            licensePlate,
            make,
            model,
            category: category,
            driverPhoto,
            vehiclePhoto,
            status: 'pending',
            rating: 5.0,
            totalRides: 0,
            earnings: 0
          });

          // C1. Send Email Notification
          await sendEmailNotification(email, "Aam Rides - Application Received", {
            type: 'driver_application',
            name,
            email
          });

          // D1. IMPORTANT: Manually refresh role
          // This tells AuthContext to check the DB *now* and see the new 'driver' document
          if (refreshUserRole) {
            await refreshUserRole(uid);
          }

          // E1. Show Success Modal
          setShowSuccessModal(true);
          
        } else {
          // --- RIDER REGISTRATION ---
          
          // B2. Save Rider Data
          await setDoc(doc(db, "riders", uid), baseData);

          // C2. Send Welcome Email
          await sendEmailNotification(email, "Welcome to Aam Rides", {
            type: 'rider_welcome',
            name,
            email
          });

          // D2. Refresh Role for Rider
          if (refreshUserRole) {
            await refreshUserRole(uid);
          }

          Alert.alert("Success", "Account created successfully", [
            { text: "OK" }
          ]);
        }

      } else {
        // --- LOGIN FLOW ---
        await signInWithEmailAndPassword(auth, email, password);
        // We don't need to manually refresh here because the 
        // onAuthStateChanged listener in AuthContext will trigger automatically
      }
      
    } catch (error) {
      // --- ERROR HANDLING ---
      console.log("Auth Error:", error);
      let errorMessage = "An error occurred";
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "This email is already registered";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Invalid email address";
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = "No account found with this email";
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = "Incorrect password";
      } else {
        // Capture other errors (like Firestore permission issues)
        errorMessage = error.message; 
      }
      
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <View style={styles.authHeader}>
          <TouchableOpacity onPress={() => navigation.navigate('Welcome')} style={{padding: 10}}>
            <Ionicons name="arrow-back" size={24} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {mode === 'driver' ? "Captain Portal" : "Rider Account"}
          </Text>
          <View style={{width: 44}} />
        </View>

        <ScrollView 
          contentContainerStyle={{paddingHorizontal: 25, paddingBottom: 100}} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{alignItems: 'center', marginBottom: 25, marginTop: 10}}>
            <Image 
              source={require('./assets/aam.png')} 
              style={{width: 70, height: 70, marginBottom: 15}} 
              resizeMode="contain"
            />
            <Text style={styles.authTitle}>
              {isSignUp ? "Create New Account" : "Welcome Back"}
            </Text>
          </View>

          {isSignUp && (
            <>
              <TextInput 
                style={styles.input} 
                placeholder="Full Name" 
                value={name} 
                onChangeText={setName} 
                autoCapitalize="words"
              />
              
              <TextInput 
                style={styles.input} 
                placeholder="Mobile Number" 
                value={phone} 
                onChangeText={setPhone} 
                keyboardType="phone-pad" 
              />
              
              <TextInput 
                style={styles.input} 
                placeholder="Age" 
                value={age} 
                onChangeText={setAge} 
                keyboardType="numeric" 
              />
              
              <TextInput 
                style={styles.input} 
                placeholder="Home Address" 
                value={address} 
                onChangeText={setAddress} 
                multiline
                numberOfLines={2}
              />

              {mode === 'driver' && (
                <View style={styles.driverSection}>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}>
                    <FontAwesome5 name="car" size={18} color={COLORS.primary} />
                    <Text style={[styles.sectionTitle, {marginLeft: 10, marginBottom: 0}]}>Vehicle Information</Text>
                  </View>
                  
                  <TextInput 
                    style={styles.input} 
                    placeholder="CNIC Number" 
                    value={cnic} 
                    onChangeText={setCnic} 
                    keyboardType="numeric"
                  />
                  
                  <TextInput 
                    style={styles.input} 
                    placeholder="License Plate (e.g., ABC-123)" 
                    value={licensePlate} 
                    onChangeText={setLicensePlate} 
                    autoCapitalize="characters"
                  />
                  
                  <TextInput 
                    style={styles.input} 
                    placeholder="Vehicle Make (e.g., Honda)" 
                    value={make} 
                    onChangeText={setMake} 
                  />
                  
                  <TextInput 
                    style={styles.input} 
                    placeholder="Vehicle Model (e.g., Civic)" 
                    value={model} 
                    onChangeText={setModel} 
                  />

                  <Text style={styles.label}>Vehicle Type</Text>
                  <View style={styles.pillContainer}>
                    {['Bike', 'Hatchback', 'Sedan'].map(type => (
                      <TouchableOpacity 
                        key={type} 
                        onPress={() => setVehicleType(type)} 
                        style={[styles.pill, vehicleType === type && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, vehicleType === type && {color: 'white'}]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {vehicleType !== 'Bike' && (
                    <TouchableOpacity 
                      onPress={() => setHasAC(!hasAC)} 
                      style={styles.checkboxRow}
                    >
                      <MaterialIcons 
                        name={hasAC ? "check-box" : "check-box-outline-blank"} 
                        size={24} 
                        color={COLORS.primary}
                      />
                      <Text style={{marginLeft: 10, color: COLORS.black}}>
                        Vehicle has Air Conditioning
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.categoryBadge}>
                    <MaterialCommunityIcons name="tag" size={16} color={COLORS.primary} />
                    <Text style={[styles.categoryText, {marginLeft: 8}]}>
                      Category: {getVehicleCategory(vehicleType, hasAC).name}
                    </Text>
                  </View>

                  <Text style={styles.label}>Driver Photo</Text>
                  <TouchableOpacity 
                    onPress={() => pickImage('driver')} 
                    style={styles.photoUploadBox}
                  >
                    {driverPhoto ? (
                      <Image source={{uri: driverPhoto}} style={styles.uploadedImage} />
                    ) : (
                      <View style={styles.uploadPlaceholder}>
                        <MaterialIcons name="add-a-photo" size={30} color={COLORS.gray} />
                        <Text style={{color: COLORS.gray, marginTop: 10}}>
                          Upload Driver Photo
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.label}>Vehicle Photo</Text>
                  <TouchableOpacity 
                    onPress={() => pickImage('vehicle')} 
                    style={styles.photoUploadBox}
                  >
                    {vehiclePhoto ? (
                      <Image source={{uri: vehiclePhoto}} style={styles.uploadedImage} />
                    ) : (
                      <View style={styles.uploadPlaceholder}>
                        <MaterialIcons name="add-a-photo" size={30} color={COLORS.gray} />
                        <Text style={{color: COLORS.gray, marginTop: 10}}>
                          Upload Vehicle Photo
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          <TextInput 
            style={styles.input} 
            placeholder="Email Address" 
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
            keyboardType="email-address" 
          />
          
          <TextInput 
            style={styles.input} 
            placeholder="Password" 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />

          {isSignUp && (
            <TextInput 
              style={styles.input} 
              placeholder="Confirm Password" 
              value={retypePassword} 
              onChangeText={setRetypePassword} 
              secureTextEntry 
            />
          )}

          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnText}>
                {isSignUp ? (mode === 'driver' ? "Submit Application" : "Create Account") : "Log In"}
              </Text>
            )}
          </TouchableOpacity>

          <View style={{marginTop: 20, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap'}}>
            <Text style={{color: COLORS.gray, fontSize: 15}}>
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
              <Text style={{color: COLORS.primary, fontWeight: 'bold', fontSize: 15}}>
                {isSignUp ? "Log In" : "Register"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSuccessModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <MaterialIcons name="check-circle" size={70} color={COLORS.green} />
            <Text style={styles.modalTitle}>Application Submitted</Text>
            <Text style={styles.modalText}>
              Thank you, {name}! Your application is under review. 
              You will receive an email notification once processed.
            </Text>
           // Around line 813, in the Modal component

          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => {
              setShowSuccessModal(false);
              // ✅ CHANGED: Don't navigate to Welcome - sign out instead so they can log in
              signOut(auth);
            }}
          >
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// 3. MAIN SCREEN
function MainScreen({ navigation }) {
  const { user, userRole } = useContext(AuthContext);
  const [driverStatus, setDriverStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user || userRole !== 'driver') {
      setChecking(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "drivers", user.uid), (snap) => {
      if (snap.exists()) {
        setDriverStatus(snap.data().status);
      }
      setChecking(false);
    });

    return unsub;
  }, [user, userRole]);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary}/>
      </View>
    );
  }

  if (userRole === 'driver') {
    if (driverStatus === 'pending') {
      return <PendingApprovalScreen />;
    }
    if (driverStatus === 'rejected') {
      return <RejectedScreen />;
    }
    return <DriverDashboard navigation={navigation} />;
  }

  return <RiderDashboard navigation={navigation} />;
}

// PENDING APPROVAL
function PendingApprovalScreen() {
  return (
    <SafeAreaView style={styles.center}>
      <MaterialIcons name="schedule" size={100} color={COLORS.yellow} />
      <Text style={styles.pendingTitle}>Application Under Review</Text>
      <Text style={styles.pendingText}>
        Your driver application is being reviewed by our team. 
        You will receive an email notification once approved.
      </Text>
      <TouchableOpacity 
        onPress={() => signOut(auth)} 
        style={[styles.primaryBtn, {marginTop: 30, backgroundColor: COLORS.red, width: 200}]}
      >
        <MaterialIcons name="logout" size={20} color="white" style={{marginRight: 8}} />
        <Text style={styles.btnText}>Log Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// REJECTED
function RejectedScreen() {
  return (
    <SafeAreaView style={styles.center}>
      <MaterialIcons name="cancel" size={100} color={COLORS.red} />
      <Text style={[styles.pendingTitle, {color: COLORS.red}]}>Application Rejected</Text>
      <Text style={styles.pendingText}>
        Unfortunately, your application was not approved. 
        Please contact support for more information.
      </Text>
      <TouchableOpacity 
        onPress={() => signOut(auth)} 
        style={[styles.primaryBtn, {marginTop: 30, backgroundColor: COLORS.red, width: 200}]}
      >
        <MaterialIcons name="logout" size={20} color="white" style={{marginRight: 8}} />
        <Text style={styles.btnText}>Log Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// 4. DRIVER DASHBOARD
function DriverDashboard({ navigation }) {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [bidModal, setBidModal] = useState(null);
  const [bidPrice, setBidPrice] = useState('');
  const [driverData, setDriverData] = useState(null);

  useEffect(() => {
    const driverUnsub = onSnapshot(doc(db, "drivers", user.uid), (snap) => {
      if (snap.exists()) {
        setDriverData(snap.data());
      }
    });

    const categoryId = driverData?.category?.id;
    if (categoryId) {
      const q = query(
        collection(db, "bookings"),
        where("categoryId", "==", categoryId),
        where("status", "in", ["searching", "negotiating"])
      );
      
      const requestsUnsub = onSnapshot(q, (snap) => {
        const allRequests = snap.docs.map(d => ({id: d.id, ...d.data()}));
        // Filter out requests where this driver already bid
        const filtered = allRequests.filter(req => {
          const offers = req.offers || [];
          return !offers.some(offer => offer.driverId === user.uid);
        });
        setRequests(filtered);
      });

      const activeQ = query(
        collection(db, "bookings"),
        where("driverId", "==", user.uid),
        where("status", "in", ["accepted", "in_progress"])
      );
      
      const activeUnsub = onSnapshot(activeQ, (snap) => {
        if (!snap.empty) {
          setActiveRide({id: snap.docs[0].id, ...snap.docs[0].data()});
        } else {
          setActiveRide(null);
        }
      });

      return () => {
        driverUnsub();
        requestsUnsub();
        activeUnsub();
      };
    }

    return driverUnsub;
  }, [user, driverData?.category?.id]);

  // Around line 945, replace submitBid function:

const submitBid = async () => {
  const price = parseInt(bidPrice);
  
  if (!bidPrice || isNaN(price) || price < 1) {
    Alert.alert("Error", "Please enter a valid price");
    return;
  }

  try {
    console.log("Submitting bid for booking:", bidModal.id);
    
    const bidData = {
      driverId: user.uid,
      driverName: driverData.name || 'Unknown Driver',
      driverPhoto: driverData.driverPhoto || null,
      vehiclePhoto: driverData.vehiclePhoto || null,
      licensePlate: driverData.licensePlate || 'N/A',
      rating: driverData.rating || 5.0,
      price: price,
      timestamp: new Date().toISOString() // Use ISO string instead of serverTimestamp
    };

    await updateDoc(doc(db, "bookings", bidModal.id), {
      status: "negotiating",
      offers: arrayUnion(bidData)
    });

    Alert.alert("Success", "Your bid has been submitted");
    setBidModal(null);
    setBidPrice('');
  } catch (error) {
    console.error("Bid submission error:", error);
    Alert.alert("Error", `Failed to submit bid: ${error.message}`);
  }
};
  if (activeRide) {
    return <ActiveRideScreen ride={activeRide} isDriver={true} navigation={navigation} />;
  }

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <View style={styles.dashboardHeader}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Image 
            source={require('./assets/aam.png')} 
            style={{width: 35, height: 35, marginRight: 15}} 
            resizeMode="contain"
          />
          <View>
            <Text style={styles.headerTitle}>Available Rides</Text>
            <Text style={{color: COLORS.gray, fontSize: 12}}>
              {driverData?.category?.name || 'Loading...'}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <MaterialIcons name="menu" size={24} color={COLORS.black} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="car-multiple" size={24} color={COLORS.primary} />
          <Text style={styles.statValue}>{driverData?.totalRides || 0}</Text>
          <Text style={styles.statLabel}>Rides</Text>
        </View>
        <View style={styles.statBox}>
          <MaterialIcons name="star" size={24} color={COLORS.yellow} />
          <Text style={styles.statValue}>{driverData?.rating?.toFixed(1) || '5.0'}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="cash" size={24} color={COLORS.green} />
          <Text style={styles.statValue}>PKR {driverData?.earnings || 0}</Text>
          <Text style={styles.statLabel}>Earnings</Text>
        </View>
      </View>

      <FlatList
        data={requests}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="inbox" size={60} color={COLORS.gray} />
            <Text style={styles.emptyText}>No ride requests at the moment</Text>
            <Text style={{color: COLORS.gray, textAlign: 'center', marginTop: 5}}>
              New requests will appear here
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.requestCard}>
            <View style={styles.cardHeader}>
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 5}}>
                  <MaterialCommunityIcons name="car" size={16} color={COLORS.primary} />
                  <Text style={[styles.cardTitle, {marginLeft: 5}]}>New Ride Request</Text>
                </View>
                <Text style={{color: COLORS.gray, fontSize: 12}}>
                  {item.createdAt && new Date(item.createdAt.toDate()).toLocaleTimeString()}
                </Text>
              </View>
              <View style={styles.priceBadge}>
                <Text style={styles.priceText}>PKR {item.estimatedFare}</Text>
              </View>
            </View>

            <View style={styles.routeContainer}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, {backgroundColor: COLORS.green}]} />
                <Text style={styles.routeText} numberOfLines={1}>{item.pickupAddress}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, {backgroundColor: COLORS.red}]} />
                <Text style={styles.routeText} numberOfLines={1}>{item.dropoffAddress}</Text>
              </View>
            </View>

            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 15}}>
              <View style={styles.infoChip}>
                <MaterialIcons name="navigation" size={14} color={COLORS.primary} />
                <Text style={{marginLeft: 5, fontSize: 12}}>{item.distance} km</Text>
              </View>
              <View style={styles.infoChip}>
                <MaterialIcons name="person" size={14} color={COLORS.primary} />
                <Text style={{marginLeft: 5, fontSize: 12}}>{item.riderName}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.bidButton} 
              onPress={() => {
                setBidModal(item);
                setBidPrice(item.estimatedFare.toString());
              }}
            >
              <MaterialCommunityIcons name="cash-multiple" size={20} color="white" style={{marginRight: 8}} />
              <Text style={styles.btnText}>Make Offer</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={!!bidModal} transparent animationType="slide">
  <TouchableWithoutFeedback onPress={() => setBidModal(null)}>
    <View style={styles.modalOverlay}>
      <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
        <View style={styles.bidModalContent}>
          <Text style={styles.modalTitle}>Make Your Offer</Text>
          
          <View style={styles.fareInfo}>
            <Text style={{color: COLORS.gray}}>Estimated Fare</Text>
            <Text style={styles.estimatedFare}>PKR {bidModal?.estimatedFare || 0}</Text>
          </View>

          <Text style={styles.label}>Your Offer (PKR)</Text>
          <TextInput
            style={styles.bidInput}
            value={bidPrice}
            onChangeText={setBidPrice}
            keyboardType="numeric"
            placeholder="Enter amount"
          />

          <View style={{flexDirection: 'row', gap: 10}}>
            <TouchableOpacity 
              style={[styles.modalButton, {backgroundColor: COLORS.lightGray, flex: 1}]} 
              onPress={() => setBidModal(null)}
            >
              <Text style={{color: COLORS.black, fontWeight: 'bold'}}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, {flex: 1, backgroundColor: COLORS.primary}]} 
              onPress={submitBid}
            >
              <Text style={styles.btnText}>Submit Bid</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

    </SafeAreaView>
  );
}

function RiderDashboard({ navigation }) {
  const { user } = useContext(AuthContext);
  const [step, setStep] = useState(1);
  
  const [currentLocation, setCurrentLocation] = useState(null);
  const [pickupAddress, setPickupAddress] = useState('Current Location');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState(null);
  
  const [suggestions, setSuggestions] = useState([]);
  const [activeField, setActiveField] = useState(null);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [searching, setSearching] = useState(false);
  
  const [distance, setDistance] = useState(0);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [activeBooking, setActiveBooking] = useState(null);
  const [offers, setOffers] = useState([]);
  const [riderData, setRiderData] = useState(null);
  
  // Pin mode states
  const [isPinMode, setIsPinMode] = useState(false);
  const [centerCoords, setCenterCoords] = useState(null);
  const [previewAddress, setPreviewAddress] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  
  const mapRef = useRef(null);
  const pickupInputRef = useRef(null);
  const dropoffInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const previewTimeoutRef = useRef(null);
  const mapReadyRef = useRef(false);
  const hasActiveBookingRef = useRef(false);

  const fetchUserLocation = async (retryCount = 0) => {
    try {
      setLocationLoading(true);
      
      // Request location permissions (this will return current status if already granted)
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          "Location Permission Required",
          "Please enable location access in your device settings to use this feature.",
          [{ text: "OK" }]
        );
        setLocationLoading(false);
        return;
      }

      // Enable location services
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert(
          "Location Services Disabled",
          "Please enable location services in your device settings.",
          [{ text: "OK" }]
        );
        setLocationLoading(false);
        return;
      }

      // Get current position with timeout
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Location timeout')), 15000)
        )
      ]);

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      };

      setCurrentLocation(coords);
      setPickupCoords(coords);
      
      // Wait for map to be ready, then animate
      const animateMap = () => {
        if (mapRef.current && mapReadyRef.current) {
          mapRef.current.animateToRegion(coords, 1000);
        } else {
          // Retry after a short delay if map isn't ready
          setTimeout(animateMap, 100);
        }
      };
      animateMap();

      // Get address
      try {
        const address = await reverseGeocode(coords.latitude, coords.longitude);
        if (address) setPickupAddress(address);
      } catch (error) {
        console.log("Reverse geocode error:", error);
        // Continue even if reverse geocode fails
      }
      
      setLocationLoading(false);
    } catch (error) {
      console.log("Location error:", error);
      
      // Retry up to 2 times
      if (retryCount < 2) {
        setTimeout(() => fetchUserLocation(retryCount + 1), 2000);
      } else {
        Alert.alert(
          "Location Error",
          "Unable to get your location. Please check your GPS settings and try again.",
          [
            { text: "Retry", onPress: () => fetchUserLocation(0) },
            { text: "OK", style: "cancel" }
          ]
        );
        setLocationLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchUserLocation();

    const riderUnsub = onSnapshot(doc(db, "riders", user.uid), (snap) => {
      if (snap.exists()) {
        setRiderData(snap.data());
      }
    });

    // Query for active bookings AND completed bookings without rating
    const activeBookingsQ = query(
      collection(db, "bookings"),
      where("riderId", "==", user.uid),
      where("status", "in", ["searching", "negotiating", "accepted", "in_progress"])
    );
    
    const completedBookingsQ = query(
      collection(db, "bookings"),
      where("riderId", "==", user.uid),
      where("status", "==", "completed")
    );
    
    const activeUnsub = onSnapshot(activeBookingsQ, (snap) => {
      if (!snap.empty) {
        hasActiveBookingRef.current = true;
        const booking = {id: snap.docs[0].id, ...snap.docs[0].data()};
        setActiveBooking(booking);

        if (booking.status === 'negotiating') {
          setOffers(booking.offers || []);
          setStep(3);
        } else if (['accepted', 'in_progress'].includes(booking.status)) {
          setStep(4);
        }
      } else {
        hasActiveBookingRef.current = false;
        // Check for completed booking without rating
        // This will be handled by the completed bookings listener
      }
    });

    const completedUnsub = onSnapshot(completedBookingsQ, (snap) => {
      // Only process if there's no active booking
      if (!hasActiveBookingRef.current) {
        // Find completed booking without rating
        const unratedCompleted = snap.docs.find(doc => {
          const data = doc.data();
          return !data.riderRating;
        });
        
        if (unratedCompleted) {
          // Don't automatically show completed rides on app open
          // Only show if ride was just completed (within last 5 minutes)
          const booking = {id: unratedCompleted.id, ...unratedCompleted.data()};
          const completedAt = booking.completedAt?.toDate();
          const now = new Date();
          const minutesSinceCompletion = completedAt ? (now - completedAt) / (1000 * 60) : 999;
          
          // Only show if completed within last 5 minutes (just completed)
          // This prevents showing old completed rides when app opens
          if (minutesSinceCompletion < 5) {
            setActiveBooking(booking);
            setStep(4); // Keep on step 4 to show ActiveRideScreen
          } else {
            // Old completed ride - don't show, go to dashboard
            // User can rate from ride history if needed
            setActiveBooking(null);
            setStep(1);
          }
        } else if (snap.empty) {
          // No active or unrated completed bookings - reset to step 1
          setActiveBooking(null);
          setOffers([]);
          setStep(1);
          setSelectedCategory(null);
          setDropoffAddress('');
          setDropoffCoords(null);
          setDistance(0);
          setRouteCoordinates([]);
        }
      }
    });

    const showListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      if (suggestions.length === 0) {
        setActiveField(null);
      }
    });

    return () => {
      riderUnsub();
      activeUnsub();
      completedUnsub();
      showListener.remove();
      hideListener.remove();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
  }, [user]);

  const reverseGeocode = async (lat, lon) => {
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${GEOAPIFY_KEY}`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        return data.features[0].properties.formatted;
      }
    } catch (error) {
      console.log("Reverse geocode error:", error);
    }
    return null;
  };

  const searchLocation = (text) => {
    // Update input immediately for responsive typing
    if (activeField === 'pickup') {
      setPickupAddress(text);
    } else {
      setDropoffAddress(text);
    }

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (text.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    // Debounce API call
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:pk&bias=proximity:67.0011,24.8607&limit=5&apiKey=${GEOAPIFY_KEY}`
        );
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const results = data.features.map((item, index) => ({
            // Combine place_id with index to ensure uniqueness
            id: `${item.properties.place_id || 'place'}_${index}_${Date.now()}`, 
            name: item.properties.formatted || item.properties.address_line1,
            lat: item.properties.lat,
            lon: item.properties.lon
          }));
          setSuggestions(results);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        console.log("Search error:", error);
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const selectLocation = async (item) => {
    const coords = {
      latitude: item.lat,
      longitude: item.lon,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01
    };

    if (activeField === 'pickup') {
      setPickupAddress(item.name);
      setPickupCoords(coords);
    } else {
      setDropoffAddress(item.name);
      setDropoffCoords(coords);
    }

    setSuggestions([]);
    setActiveField(null);
    Keyboard.dismiss();

    mapRef.current?.animateToRegion(coords, 1000);

    // Calculate distance and route if both locations are set
    if ((activeField === 'pickup' && dropoffCoords) || (activeField === 'dropoff' && pickupCoords)) {
      const pickup = activeField === 'pickup' ? coords : pickupCoords;
      const dropoff = activeField === 'dropoff' ? coords : dropoffCoords;
      
      const result = await calculateRoadDistance(pickup, dropoff);
      setDistance(result.distance);
      setRouteCoordinates(result.route);

      if (mapRef.current && result.route.length > 1) {
        mapRef.current.fitToCoordinates(result.route, {
          edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
          animated: true
        });
      }
    }
  };

  const useCurrentLocation = async () => {
    let locationToUse = currentLocation;
    
    // If location is not available, fetch it first
    if (!locationToUse) {
      try {
        setLocationLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert("Permission Denied", "Location access is required");
          setLocationLoading(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        locationToUse = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        };

        setCurrentLocation(locationToUse);
        setLocationLoading(false);
      } catch (error) {
        console.log("Location fetch error:", error);
        Alert.alert("Error", "Unable to get your current location");
        setLocationLoading(false);
        return;
      }
    }

    const address = await reverseGeocode(locationToUse.latitude, locationToUse.longitude);
    
    if (activeField === 'pickup') {
      setPickupAddress(address || 'Current Location');
      setPickupCoords(locationToUse);
    } else {
      setDropoffAddress(address || 'Current Location');
      setDropoffCoords(locationToUse);
    }

    mapRef.current?.animateToRegion(locationToUse, 1000);
    setSuggestions([]);
    setActiveField(null);
    Keyboard.dismiss();
  };

  const enterPinMode = () => {
    setIsPinMode(true);
    setSuggestions([]);
    Keyboard.dismiss();
    setPreviewAddress('');
    
    const targetCoords = activeField === 'pickup' ? 
      (pickupCoords || currentLocation) : 
      (dropoffCoords || currentLocation);
    
    if (targetCoords) {
      mapRef.current?.animateToRegion(targetCoords, 500);
      fetchPreviewAddress(targetCoords.latitude, targetCoords.longitude);
    }
  };

  const fetchPreviewAddress = async (lat, lon) => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    setLoadingPreview(true);

    previewTimeoutRef.current = setTimeout(async () => {
      const address = await reverseGeocode(lat, lon);
      setPreviewAddress(address || 'Unknown location');
      setLoadingPreview(false);
    }, 800);
  };

  const onRegionChangeComplete = async (region) => {
    if (isPinMode) {
      setCenterCoords({
        latitude: region.latitude,
        longitude: region.longitude
      });
      
      fetchPreviewAddress(region.latitude, region.longitude);
    }
  };

  const confirmPinLocation = async () => {
    if (!centerCoords) return;

    const address = previewAddress || await reverseGeocode(centerCoords.latitude, centerCoords.longitude);
    
    const coords = {
      ...centerCoords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01
    };

    if (activeField === 'pickup') {
      setPickupAddress(address || 'Selected Location');
      setPickupCoords(coords);
    } else {
      setDropoffAddress(address || 'Selected Location');
      setDropoffCoords(coords);
    }

    setIsPinMode(false);
    setCenterCoords(null);
    setPreviewAddress('');

    // Calculate distance if both locations set
    if ((activeField === 'pickup' && dropoffCoords) || (activeField === 'dropoff' && pickupCoords)) {
      const pickup = activeField === 'pickup' ? coords : pickupCoords;
      const dropoff = activeField === 'dropoff' ? coords : dropoffCoords;
      
      const result = await calculateRoadDistance(pickup, dropoff);
      setDistance(result.distance);
      setRouteCoordinates(result.route);

      if (mapRef.current && result.route.length > 1) {
        mapRef.current.fitToCoordinates(result.route, {
          edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
          animated: true
        });
      }
    }
  };

  const requestRide = async () => {
    if (!selectedCategory) {
      Alert.alert("Error", "Please select a ride category");
      return;
    }

    if (!pickupCoords || !dropoffCoords) {
      Alert.alert("Error", "Please select pickup and dropoff locations");
      return;
    }

    if (distance > 40) {
      Alert.alert("Distance Too Long", "We currently don't support rides longer than 40 km");
      return;
    }

    try {
      const fare = calculateFare(distance, selectedCategory.id);
      
      await addDoc(collection(db, "bookings"), {
        riderId: user.uid,
        riderName: riderData?.name || 'Rider',
        riderPhone: riderData?.phone || '',
        pickupAddress,
        pickupCoords: {
          latitude: pickupCoords.latitude,
          longitude: pickupCoords.longitude
        },
        dropoffAddress,
        dropoffCoords: {
          latitude: dropoffCoords.latitude,
          longitude: dropoffCoords.longitude
        },
        distance: parseFloat(distance),
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        estimatedFare: fare,
        status: 'searching',
        offers: [],
        createdAt: serverTimestamp()
      });

      setStep(3);
      Alert.alert("Searching", "Broadcasting your request to nearby captains");
    } catch (error) {
      Alert.alert("Error", "Failed to create booking");
    }
  };

  const acceptOffer = async (offer) => {
    try {
      await updateDoc(doc(db, "bookings", activeBooking.id), {
        status: 'accepted',
        driverId: offer.driverId,
        driverName: offer.driverName,
        driverPhoto: offer.driverPhoto,
        vehiclePhoto: offer.vehiclePhoto,
        licensePlate: offer.licensePlate,
        finalPrice: offer.price,
        acceptedAt: serverTimestamp()
      });

      Alert.alert("Ride Confirmed", `${offer.driverName} is on the way`);
      setStep(4);
    } catch (error) {
      Alert.alert("Error", "Failed to accept offer");
    }
  };

  const cancelBooking = async () => {
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this ride?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "bookings", activeBooking.id), {
                status: 'cancelled',
                cancelledBy: 'rider',
                cancelledAt: serverTimestamp()
              });

              setStep(1);
              setActiveBooking(null);
              setOffers([]);
              setSelectedCategory(null);
              setDropoffAddress('');
              setDropoffCoords(null);
              setDistance(0);
              setRouteCoordinates([]);
            } catch (error) {
              Alert.alert("Error", "Failed to cancel booking");
            }
          }
        }
      ]
    );
  };

  if (step === 4 && activeBooking) {
    return <ActiveRideScreen ride={activeBooking} isDriver={false} navigation={navigation} />;
  }

  const getBottomSheetHeight = () => {
    if (step === 2) return 500;
    if (step === 3) return 600;
    if (isKeyboardVisible) return '75%';
    return 320;
  };

  return (
    <View style={{flex: 1}}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 24.8607,
          longitude: 67.0011,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        onRegionChangeComplete={onRegionChangeComplete}
        onMapReady={() => {
          mapReadyRef.current = true;
          // If we already have location, animate to it
          if (currentLocation) {
            mapRef.current?.animateToRegion(currentLocation, 1000);
          }
        }}
        scrollEnabled={true}
        zoomEnabled={true}
      >
        <UrlTile
          urlTemplate={`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
          maximumZ={19}
        />

        {!isPinMode && pickupCoords && (
          <Marker coordinate={pickupCoords} title="Pickup">
            <View style={styles.markerContainer}>
              <View style={[styles.markerDot, {backgroundColor: COLORS.green}]} />
            </View>
          </Marker>
        )}

        {!isPinMode && dropoffCoords && (
          <Marker coordinate={dropoffCoords} title="Dropoff">
            <View style={styles.markerContainer}>
              <View style={[styles.markerDot, {backgroundColor: COLORS.red}]} />
            </View>
          </Marker>
        )}

        {!isPinMode && routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor={COLORS.primary}
          />
        )}
      </MapView>

      {/* Center Pin Indicator */}
      {isPinMode && (
        <View style={styles.pinContainer} pointerEvents="none">
          <MaterialIcons name="place" size={50} color={activeField === 'pickup' ? COLORS.green : COLORS.red} />
        </View>
      )}

      {/* Address Preview Under Pin */}
      {isPinMode && (
        <View style={styles.previewAddressContainer} pointerEvents="none">
          <View style={styles.previewAddressBox}>
            {loadingPreview ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <MaterialIcons name="location-on" size={16} color={COLORS.primary} />
                <Text style={styles.previewAddressText} numberOfLines={2}>
                  {previewAddress || 'Loading address...'}
                </Text>
              </>
            )}
          </View>
        </View>
      )}

      {/* Pin Mode Confirmation */}
      {isPinMode && (
        <View style={styles.pinConfirmContainer}>
          <TouchableOpacity 
            style={[styles.pinButton, {backgroundColor: COLORS.lightGray}]}
            onPress={() => {
              setIsPinMode(false);
              setCenterCoords(null);
              setPreviewAddress('');
            }}
          >
            <Text style={{color: COLORS.black, fontWeight: 'bold'}}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.pinButton, {backgroundColor: COLORS.primary, flex: 1.5}]}
            onPress={confirmPinLocation}
          >
            <MaterialIcons name="check" size={20} color="white" style={{marginRight: 5}} />
            <Text style={styles.btnText}>Confirm Location</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isPinMode && (
        <>
          <TouchableOpacity 
            style={styles.hamburgerButton} 
            onPress={() => navigation.openDrawer()}
          >
            <MaterialIcons name="menu" size={24} color={COLORS.black} />
          </TouchableOpacity>
          
          {/* Location Refresh Button - Moved to top right */}
          <TouchableOpacity 
            style={[styles.hamburgerButton, {
              left: undefined,
              right: 20,
              backgroundColor: locationLoading ? COLORS.lightGray : COLORS.white
            }]}
            onPress={() => fetchUserLocation(0)}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <MaterialIcons name="my-location" size={24} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </>
      )}

      {!isPinMode && (
        <View style={[styles.bottomSheet, { height: getBottomSheetHeight() }]}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{flex: 1}}>
              {step === 1 && (
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20}}>
                  <MaterialIcons name="location-on" size={24} color={COLORS.primary} />
                  <Text style={[styles.sheetTitle, {marginBottom: 0, marginLeft: 10}]}>Where to?</Text>
                </View>

                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                  <View style={styles.locationInputContainer}>
                    <View style={[styles.locationDot, {backgroundColor: COLORS.green}]} />
                    <TextInput
                      ref={pickupInputRef}
                      style={styles.locationInput}
                      value={pickupAddress}
                      placeholder="Pickup Location"
                      onFocus={() => setActiveField('pickup')}
                      onChangeText={searchLocation}
                      returnKeyType="done"
                    />
                    <TouchableOpacity 
                      onPress={() => {
                        setActiveField('pickup');
                        enterPinMode();
                      }}
                      style={{padding: 5}}
                    >
                      <MaterialIcons name="my-location" size={20} color={COLORS.primary} />
                    </TouchableOpacity>
                    {pickupAddress !== 'Current Location' && (
                      <TouchableOpacity onPress={() => {
                        setPickupAddress('Current Location');
                        setPickupCoords(currentLocation);
                        setSuggestions([]);
                      }}>
                        <MaterialIcons name="close" size={18} color={COLORS.gray} />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableWithoutFeedback>

                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                  <View style={styles.locationInputContainer}>
                <View style={[styles.locationDot, {backgroundColor: COLORS.red}]} />
                <TextInput
                  ref={dropoffInputRef}
                  style={styles.locationInput}
                  value={dropoffAddress}
                  placeholder="Dropoff Location"
                  onFocus={() => setActiveField('dropoff')}
                  onChangeText={searchLocation}
                  returnKeyType="done"
                />
                <TouchableOpacity 
                  onPress={() => {
                    setActiveField('dropoff');
                    enterPinMode();
                  }}
                  style={{padding: 5}}
                >
                  <MaterialIcons name="my-location" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                {dropoffAddress !== '' && (
                  <TouchableOpacity onPress={() => {
                    setDropoffAddress('');
                    setDropoffCoords(null);
                    setSuggestions([]);
                    setDistance(0);
                    setRouteCoordinates([]);
                  }}>
                      <MaterialIcons name="close" size={18} color={COLORS.gray} />
                    </TouchableOpacity>
                  )}
                  </View>
                </TouchableWithoutFeedback>

                {isKeyboardVisible && (
                  <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                    <View style={{flex: 1, marginTop: 10}}>
                      {searching && (
                        <View style={{padding: 20, alignItems: 'center'}}>
                          <ActivityIndicator size="small" color={COLORS.primary} />
                        </View>
                      )}

                      {!searching && suggestions.length > 0 && (
                        <FlatList
                          data={suggestions}
                          keyExtractor={item => item.id}
                          keyboardShouldPersistTaps="handled"
                          renderItem={({item}) => (
                            <TouchableOpacity
                              style={styles.suggestionItem}
                              onPress={() => {
                                Keyboard.dismiss();
                                selectLocation(item);
                              }}
                            >
                          <MaterialIcons name="location-on" size={20} color={COLORS.gray} />
                          <Text style={styles.suggestionText} numberOfLines={2}>
                            {item.name}
                          </Text>
                            </TouchableOpacity>
                          )}
                        />
                      )}

                      {!searching && suggestions.length === 0 && activeField && (
                        <TouchableOpacity
                          style={styles.currentLocationButton}
                          onPress={() => {
                            Keyboard.dismiss();
                            useCurrentLocation();
                          }}
                        >
                          <MaterialIcons name="my-location" size={20} color={COLORS.primary} />
                          <Text style={{marginLeft: 10, color: COLORS.primary, fontWeight: 'bold'}}>
                            Use Current Location
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableWithoutFeedback>
                )}

              {!isKeyboardVisible && dropoffCoords && (
                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={() => setStep(2)}
                >
                  <Text style={styles.btnText}>Continue ({distance} km)</Text>
                </TouchableOpacity>
              )}
            </View>
            )}

            {step === 2 && (
                <View style={{flex: 1}}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => {
                  setStep(1);
                  setSelectedCategory(null);
                }}>
                  <Ionicons name="arrow-back" size={24} color={COLORS.black} />
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, {marginLeft: 15}]}>Select Ride ({distance} km)</Text>
              </View>

              {distance > 40 ? (
                <View style={styles.errorContainer}>
                  <MaterialIcons name="error-outline" size={50} color={COLORS.red} />
                  <Text style={styles.errorTitle}>Distance Too Long</Text>
                  <Text style={styles.errorText}>
                    We currently don't support rides longer than 40 km. 
                    Please select a closer destination.
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={{marginVertical: 20}}
                  >
                    {Object.values(CATEGORIES).map(category => {
                      const fare = calculateFare(distance, category.id);
                      const isSelected = selectedCategory?.id === category.id;

                      return (
                        <TouchableOpacity
                          key={category.id}
                          style={[styles.categoryCard, isSelected && styles.categoryCardActive]}
                          onPress={() => {
                            setSelectedCategory(category);
                            setEstimatedFare(fare);
                          }}
                        >
                          <FontAwesome5
                            name={category.icon}
                            size={35}
                            color={isSelected ? COLORS.primary : COLORS.black}
                          />
                          <Text style={[styles.categoryName, isSelected && {color: COLORS.primary}]}>
                            {category.name}
                          </Text>
                          <Text style={styles.categoryPrice}>PKR {fare}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.fareBreakdown}>
                    <Text style={styles.fareLabel}>Estimated Fare</Text>
                    <Text style={styles.fareAmount}>PKR {estimatedFare || 0}</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10}}>
                      <MaterialCommunityIcons name="cash" size={16} color={COLORS.gray} />
                      <Text style={[styles.fareNote, {marginLeft: 5}]}>
                        Pay in cash after ride completion
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.requestButton, !selectedCategory && {opacity: 0.5}]}
                    onPress={requestRide}
                    disabled={!selectedCategory}
                  >
                    <Text style={styles.btnText}>Request {selectedCategory?.name || 'Ride'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            )}

            {step === 3 && (
                <View style={{flex: 1}}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => {
                  cancelBooking();
                }}>
                  <MaterialIcons name="close" size={24} color={COLORS.red} />
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, {marginLeft: 15, flex: 1}]} numberOfLines={1}>Finding Drivers</Text>
              </View>

              {offers.length === 0 ? (
                <View style={{alignItems: 'center', marginTop: 30, paddingHorizontal: 20}}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={{marginTop: 20, color: COLORS.gray, fontSize: 16, textAlign: 'center'}}>
                    Broadcasting to nearby captains...
                  </Text>
                  <Text style={{marginTop: 10, color: COLORS.gray, textAlign: 'center', paddingHorizontal: 10}}>
                    Estimated Fare: PKR {activeBooking?.estimatedFare}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap'}}>
                    <MaterialCommunityIcons name="car-multiple" size={20} color={COLORS.primary} />
                    <Text style={[styles.offersTitle, {marginLeft: 8, marginBottom: 0, flex: 1}]}>
                      {offers.length} {offers.length === 1 ? 'Offer' : 'Offers'} Received
                    </Text>
                  </View>

                  <FlatList
                    data={offers}
                    keyExtractor={(item, index) => `offer-${item.driverId}-${index}`}
                    showsVerticalScrollIndicator={false}
                    renderItem={({item}) => (
                      <View style={styles.offerCard}>
                        <View style={{flexDirection: 'row', marginBottom: 15, alignItems: 'center'}}>
                          {item.driverPhoto ? (
                            <Image
                              source={{uri: item.driverPhoto}}
                              style={styles.driverPhoto}
                            />
                          ) : (
                            <View style={[styles.driverPhoto, {backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center'}]}>
                              <MaterialIcons name="person" size={24} color={COLORS.gray} />
                            </View>
                          )}

                          {item.vehiclePhoto && (
                            <Image
                              source={{uri: item.vehiclePhoto}}
                              style={styles.vehiclePhoto}
                            />
                          )}
                        </View>

                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                          <View style={{flex: 1, marginRight: 15}}>
                            <Text style={styles.driverName} numberOfLines={2}>{item.driverName}</Text>
                            <Text style={styles.licensePlate} numberOfLines={1}>{item.licensePlate}</Text>
                            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                              <MaterialIcons name="star" size={14} color={COLORS.yellow} />
                              <Text style={{marginLeft: 5, color: COLORS.gray, fontSize: 12}}>
                                {item.rating?.toFixed(1) || '5.0'}
                              </Text>
                            </View>
                          </View>

                          <View style={{alignItems: 'flex-end', minWidth: 90}}>
                            <Text style={styles.offerPrice} numberOfLines={1}>PKR {item.price}</Text>
                            <TouchableOpacity
                              style={styles.acceptButton}
                              onPress={() => acceptOffer(item)}
                            >
                              <Text style={{color: 'white', fontWeight: 'bold', fontSize: 13}}>Accept</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  />
                </>
              )}
            </View>
            )}
          </View>
        </TouchableWithoutFeedback>
        </View>
      )}
    </View>
  );
}


function ActiveRideScreen({ ride, isDriver, navigation }) {
  const { user } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [rideStatus, setRideStatus] = useState(ride.status);
  const [driverLocation, setDriverLocation] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [rideData, setRideData] = useState(ride);
  const [showRideStartedAlert, setShowRideStartedAlert] = useState(false);
  const [previousStatus, setPreviousStatus] = useState(ride.status);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceRemaining, setDistanceRemaining] = useState(null);
  const [rideProgress, setRideProgress] = useState(0);
  const [hasShownRatingModal, setHasShownRatingModal] = useState(false);
  const wasCompletedOnMount = useRef(ride.status === 'completed');
  const mapRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    console.log("ActiveRideScreen useEffect - isDriver:", isDriver, "rideStatus:", rideStatus);
    
    const rideUnsub = onSnapshot(doc(db, "bookings", ride.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        console.log("Ride data updated:", data.status, "isDriver:", isDriver);
        
        // Detect status changes for visual feedback
        if (previousStatus !== data.status) {
          // Show alert when ride starts (for riders)
          if (data.status === 'in_progress' && previousStatus === 'accepted' && !isDriver) {
            setShowRideStartedAlert(true);
            setTimeout(() => setShowRideStartedAlert(false), 3000);
          }
          setPreviousStatus(data.status);
        }
        
        setRideStatus(data.status);
        setRideData({id: ride.id, ...data});
        
        if (data.driverLocation) {
          setDriverLocation(data.driverLocation);
          // Update map to show driver location during ride
          if (!isDriver && mapRef.current && data.status === 'in_progress') {
            // Center map on driver location with both pickup and dropoff visible
            const bounds = [
              data.driverLocation,
              data.dropoffCoords
            ];
            mapRef.current.fitToCoordinates(bounds, {
              edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
              animated: true
            });
          } else if (!isDriver && mapRef.current && data.status === 'accepted' && data.driverLocation) {
            // When driver is accepted, show driver location approaching
            const bounds = [
              data.driverLocation,
              data.pickupCoords
            ];
            mapRef.current.fitToCoordinates(bounds, {
              edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
              animated: true
            });
          }
        }
        
        // Show rating modal ONLY when status CHANGES to completed (not on mount)
        // This prevents showing modal when app opens with already completed ride
        if (data.status === 'completed' && !isDriver && !data.riderRating) {
          // Only show if status just changed from in_progress to completed
          if (previousStatus === 'in_progress' && data.status === 'completed') {
            console.log("Ride just completed - showing rating modal");
            setHasShownRatingModal(true);
            setShowRatingModal(true);
          }
          // Don't show modal if ride was already completed when component mounted
          // User can rate from ride history if needed
        }

        // Calculate ETA and distance remaining during ride
        if (!isDriver && data.status === 'in_progress' && data.driverLocation && data.dropoffCoords) {
          // Calculate distance from driver to dropoff
          const distanceMeters = getDistance(
            { latitude: data.driverLocation.latitude, longitude: data.driverLocation.longitude },
            { latitude: data.dropoffCoords.latitude, longitude: data.dropoffCoords.longitude }
          );
          const distanceKm = (distanceMeters / 1000).toFixed(1);
          setDistanceRemaining(parseFloat(distanceKm));
          
          // Estimate ETA (assuming average speed of 30 km/h in city)
          const estimatedMinutes = Math.ceil((distanceMeters / 1000) / 30 * 60);
          setEtaMinutes(estimatedMinutes);
          
          // Calculate progress (0 to 100%)
          if (data.distance) {
            const totalDistance = parseFloat(data.distance);
            const remaining = parseFloat(distanceKm);
            const completed = totalDistance - remaining;
            const progress = Math.max(0, Math.min(100, (completed / totalDistance) * 100));
            setRideProgress(progress);
          }
        }
      }
    });

    const messagesQ = query(
      collection(db, `bookings/${ride.id}/messages`),
      orderBy("timestamp", "asc")
    );
    
    const messagesUnsub = onSnapshot(messagesQ, (snap) => {
      const newMessages = snap.docs.map(d => ({id: d.id, ...d.data()}));
      setMessages(newMessages);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: true});
      }, 100);
    });

    let locationInterval;
    if (isDriver && rideStatus !== 'completed') {
      locationInterval = setInterval(async () => {
        try {
          const location = await Location.getCurrentPositionAsync({});
          await updateDoc(doc(db, "bookings", ride.id), {
            driverLocation: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            }
          });
        } catch (error) {
          console.log("Location update error:", error);
        }
      }, 5000);
    }

    return () => {
      rideUnsub();
      messagesUnsub();
      if (locationInterval) clearInterval(locationInterval);
    };
  }, [ride.id, isDriver, rideStatus]);

  const handleBackPress = () => {
    // During active ride, allow going back to dashboard
    // But if rating modal is showing, prevent going back
    if (showRatingModal && !isDriver && rideStatus === 'completed') {
      Alert.alert(
        "Rating Required",
        "Please rate your ride experience to continue.",
        [{ text: "OK" }]
      );
      return;
    }
    // Navigate back to Main - the ride will still be active and user can return
    navigation.goBack();
  };

  const cancelRide = () => {
    Alert.alert(
      "Cancel Ride",
      "Are you sure you want to cancel this ride?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "bookings", ride.id), {
                status: 'cancelled',
                cancelledBy: isDriver ? 'driver' : 'rider',
                cancelledAt: serverTimestamp()
              });

              // Dismiss keyboard if open
              Keyboard.dismiss();
              
              // Navigate back to dashboard
              navigation.navigate('Main');
            } catch (error) {
              console.error("Cancel error:", error);
              Alert.alert("Error", "Failed to cancel ride");
            }
          }
        }
      ]
    );
  };

  const sendMessage = async () => {
    if (!messageText.trim()) return;

    try {
      await addDoc(collection(db, `bookings/${ride.id}/messages`), {
        text: messageText.trim(),
        senderId: user.uid,
        senderName: isDriver ? rideData.driverName : rideData.riderName,
        timestamp: serverTimestamp()
      });
      setMessageText('');
      Keyboard.dismiss();
    } catch (error) {
      console.log("Send message error:", error);
      Alert.alert("Error", "Failed to send message");
    }
  };

  const startRide = async () => {
    try {
      await updateDoc(doc(db, "bookings", ride.id), {
        status: 'in_progress',
        startedAt: serverTimestamp()
      });
      Alert.alert("Ride Started", "Have a safe journey!");
    } catch (error) {
      Alert.alert("Error", "Failed to start ride");
    }
  };

  const completeRide = async () => {
    Alert.alert(
      "Complete Ride",
      `Confirm ride completion?\nFare: PKR ${rideData.finalPrice}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "bookings", ride.id), {
                status: 'completed',
                completedAt: serverTimestamp()
              });

              const driverDoc = await getDoc(doc(db, "drivers", rideData.driverId));
              if (driverDoc.exists()) {
                const driverData = driverDoc.data();
                await updateDoc(doc(db, "drivers", rideData.driverId), {
                  totalRides: (driverData.totalRides || 0) + 1,
                  earnings: (driverData.earnings || 0) + rideData.finalPrice
                });
              }

              Alert.alert("Success", "Ride completed successfully!");
            } catch (error) {
              Alert.alert("Error", "Failed to complete ride");
            }
          }
        }
      ]
    );
  };

  const submitRating = async () => {
    if (!rating || rating < 1 || rating > 5) {
      Alert.alert("Error", "Please select a rating");
      return;
    }

    // Dismiss keyboard first
    Keyboard.dismiss();

    try {
      await updateDoc(doc(db, "bookings", ride.id), {
        riderRating: rating,
        riderFeedback: feedback.trim() || null,
        ratedAt: serverTimestamp()
      });

      const driverDoc = await getDoc(doc(db, "drivers", rideData.driverId));
      if (driverDoc.exists()) {
        const driverData = driverDoc.data();
        const currentRating = driverData.rating || 5.0;
        const totalRides = driverData.totalRides || 0;
        
        const newRating = ((currentRating * totalRides) + rating) / (totalRides + 1);
        
        await updateDoc(doc(db, "drivers", rideData.driverId), {
          rating: parseFloat(newRating.toFixed(1))
        });
      }

      setShowRatingModal(false);
      // Small delay before navigation to ensure rating is saved and keyboard is dismissed
      setTimeout(() => {
        navigation.navigate('Main');
      }, 500);
      
    } catch (error) {
      console.error("Rating error:", error);
      Alert.alert("Error", "Failed to submit rating. Please try again.");
    }
  };

  const skipRating = () => {
    // Rating is required, so skip just closes modal and navigates
    // But we'll make the modal required, so this won't be easily accessible
    setShowRatingModal(false);
    navigation.navigate('Main');
  };

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{flex: 1}}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Ride Started Alert Banner (for riders) */}
        {showRideStartedAlert && !isDriver && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: COLORS.green,
            padding: 15,
            zIndex: 1000,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 5
          }}>
            <MaterialIcons name="check-circle" size={24} color="white" style={{marginRight: 10}} />
            <Text style={{color: 'white', fontSize: 16, fontWeight: 'bold'}}>
              Ride Started! Your journey has begun.
            </Text>
          </View>
        )}

        {/* Prominent Status Banner for Riders - In Progress */}
        {!isDriver && rideStatus === 'in_progress' && (
          <View style={{
            backgroundColor: COLORS.primary,
            padding: 15,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 3
          }}>
            <MaterialIcons name="directions-car" size={24} color="white" style={{marginRight: 10}} />
            <Text style={{color: 'white', fontSize: 16, fontWeight: 'bold'}}>
              Ride In Progress
            </Text>
            <View style={{
              marginLeft: 15,
              backgroundColor: 'rgba(255,255,255,0.3)',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 12
            }}>
              <Text style={{color: 'white', fontSize: 12, fontWeight: '600'}}>
                {rideData.distance?.toFixed(1) || '0'} km
              </Text>
            </View>
          </View>
        )}

        {/* Status Banner for Driver Assigned */}
        {!isDriver && rideStatus === 'accepted' && (
          <View style={{
            backgroundColor: COLORS.green,
            padding: 12,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 3
          }}>
            <MaterialIcons name="person-pin-circle" size={20} color="white" style={{marginRight: 8}} />
            <Text style={{color: 'white', fontSize: 14, fontWeight: '600'}}>
              Driver is on the way to pickup location
            </Text>
          </View>
        )}

        <View style={styles.rideHeader}>
          <TouchableOpacity onPress={handleBackPress} style={{marginRight: 15, padding: 5}}>
            <Ionicons name="arrow-back" size={24} color={COLORS.black} />
          </TouchableOpacity>
          <View style={{flex: 1, marginRight: 10}}>
            <Text style={styles.rideStatus}>
              {rideStatus === 'accepted' && 'Driver Assigned'}
              {rideStatus === 'in_progress' && 'Ride In Progress'}
              {rideStatus === 'completed' && 'Ride Completed'}
            </Text>
            <Text style={{color: COLORS.gray, fontSize: 12}}>
              PKR {rideData.finalPrice}
            </Text>
          </View>
          {/* Cancel button - only show when ride can be cancelled */}
          {rideStatus !== 'completed' && rideStatus !== 'in_progress' && (
            <TouchableOpacity 
              onPress={cancelRide} 
              style={{padding: 5}}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={24} color={COLORS.red} />
            </TouchableOpacity>
          )}
        </View>

        {!isDriver && (
          <View style={styles.driverInfoCard}>
            {rideData.driverPhoto ? (
              <Image source={{uri: rideData.driverPhoto}} style={styles.driverInfoPhoto} />
            ) : (
              <View style={[styles.driverInfoPhoto, {backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center'}]}>
                <MaterialIcons name="person" size={24} color={COLORS.gray} />
              </View>
            )}
            
            <View style={{flex: 1, marginRight: 10}}>
              <Text style={styles.driverInfoName}>
                {rideData.driverName}
              </Text>
              <Text style={styles.licensePlateText}>
                {rideData.licensePlate}
              </Text>
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 3}}>
                <MaterialIcons name="star" size={14} color={COLORS.yellow} />
                <Text style={{marginLeft: 3, color: COLORS.gray, fontSize: 12}}>
                  {rideData.rating?.toFixed(1) || '5.0'}
                </Text>
              </View>
            </View>

            {rideData.vehiclePhoto && (
              <Image source={{uri: rideData.vehiclePhoto}} style={styles.vehicleInfoPhoto} />
            )}
          </View>
        )}

        <View style={{flex: 1, backgroundColor: COLORS.background}}>
          <MapView
            ref={mapRef}
            style={{flex: 1}}
            initialRegion={{
              latitude: rideData.pickupCoords.latitude,
              longitude: rideData.pickupCoords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05
            }}
            showsUserLocation={!isDriver}
          >
            <UrlTile
              urlTemplate={`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
              maximumZ={19}
            />

            <Marker coordinate={rideData.pickupCoords} title="Pickup">
              <View style={styles.markerContainer}>
                <View style={[styles.markerDot, {backgroundColor: COLORS.green}]} />
              </View>
            </Marker>

            <Marker coordinate={rideData.dropoffCoords} title="Dropoff">
              <View style={styles.markerContainer}>
                <View style={[styles.markerDot, {backgroundColor: COLORS.red}]} />
              </View>
            </Marker>

            {driverLocation && (
              <Marker coordinate={driverLocation} title="Driver">
                <View style={styles.markerContainer}>
                  <MaterialCommunityIcons name="car" size={30} color={COLORS.primary} />
                </View>
              </Marker>
            )}

            {/* Show route during ride */}
            {!isDriver && rideStatus === 'in_progress' && driverLocation && rideData.dropoffCoords && (
              <Polyline
                coordinates={[
                  driverLocation,
                  rideData.dropoffCoords
                ]}
                strokeWidth={4}
                strokeColor={COLORS.primary}
                lineDashPattern={[5, 5]}
              />
            )}

            {/* Show full route from pickup to dropoff when accepted */}
            {!isDriver && rideStatus === 'accepted' && rideData.pickupCoords && rideData.dropoffCoords && (
              <Polyline
                coordinates={[
                  rideData.pickupCoords,
                  rideData.dropoffCoords
                ]}
                strokeWidth={3}
                strokeColor={COLORS.gray}
                lineDashPattern={[3, 3]}
              />
            )}
          </MapView>
        </View>

        <View style={{backgroundColor: COLORS.white, maxHeight: '40%'}}>
          <View style={styles.chatHeaderContainer}>
            <MaterialIcons name="chat" size={20} color={COLORS.primary} />
            <Text style={styles.chatHeaderText}>Messages</Text>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            style={{maxHeight: 150}}
            contentContainerStyle={{paddingHorizontal: 15, paddingVertical: 10}}
            ListEmptyComponent={
              <Text style={{textAlign: 'center', color: COLORS.gray, fontSize: 13, paddingVertical: 20}}>
                No messages yet
              </Text>
            }
            renderItem={({item}) => (
              <View style={[
                styles.messageBubble,
                item.senderId === user.uid ? styles.myMessage : styles.theirMessage
              ]}>
                <Text style={[
                  styles.messageText,
                  item.senderId === user.uid && {color: COLORS.white}
                ]}>
                  {item.text}
                </Text>
              </View>
            )}
          />

          <View style={styles.messageInputContainer}>
            <TextInput
              style={styles.messageInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type a message..."
              placeholderTextColor={COLORS.gray}
              multiline
              maxLength={500}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
            <TouchableOpacity onPress={sendMessage} style={{padding: 5}}>
              <MaterialIcons name="send" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {isDriver && (
            <View style={{padding: 15, paddingHorizontal: 20}}>
              {rideStatus === 'accepted' && (
                <TouchableOpacity style={styles.actionButton} onPress={startRide}>
                  <MaterialIcons name="play-arrow" size={20} color="white" style={{marginRight: 8}} />
                  <Text style={styles.btnText}>Start Ride</Text>
                </TouchableOpacity>
              )}
              
              {rideStatus === 'in_progress' && (
                <TouchableOpacity 
                  style={[styles.actionButton, {backgroundColor: COLORS.green}]} 
                  onPress={completeRide}
                >
                  <MaterialIcons name="check-circle" size={20} color="white" style={{marginRight: 8}} />
                  <Text style={styles.btnText}>Complete Ride</Text>
                </TouchableOpacity>
              )}

              {rideStatus === 'completed' && (
                <View style={{alignItems: 'center', paddingVertical: 20}}>
                  <MaterialIcons name="check-circle" size={50} color={COLORS.green} />
                  <Text style={{fontSize: 18, fontWeight: 'bold', color: COLORS.green, marginTop: 10, textAlign: 'center'}}>
                    Ride Completed
                  </Text>
                  <Text style={{color: COLORS.gray, marginTop: 5, textAlign: 'center'}}>
                    Earnings: PKR {rideData.finalPrice}
                  </Text>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, {marginTop: 15, width: '100%', maxWidth: 300}]} 
                    onPress={() => navigation.navigate('Main')}
                  >
                    <Text style={styles.btnText}>Back to Dashboard</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Enhanced Status Card for Riders During Ride */}
          {!isDriver && rideStatus === 'in_progress' && (
            <View style={{
              backgroundColor: COLORS.white,
              borderTopLeftRadius: 25,
              borderTopRightRadius: 25,
              padding: 20,
              shadowColor: '#000',
              shadowOffset: {width: 0, height: -3},
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 10
            }}>
              {/* Progress Bar */}
              <View style={{marginBottom: 20}}>
                <View style={{
                  height: 6,
                  backgroundColor: COLORS.lightGray,
                  borderRadius: 3,
                  overflow: 'hidden'
                }}>
                  <Animated.View style={{
                    height: '100%',
                    width: `${rideProgress}%`,
                    backgroundColor: COLORS.primary,
                    borderRadius: 3
                  }} />
                </View>
                <Text style={{fontSize: 11, color: COLORS.gray, marginTop: 5, textAlign: 'center'}}>
                  {rideProgress.toFixed(0)}% Complete
                </Text>
              </View>

              {/* ETA and Distance Cards */}
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15}}>
                <View style={{
                  flex: 1,
                  backgroundColor: COLORS.background,
                  padding: 15,
                  borderRadius: 15,
                  marginRight: 8,
                  alignItems: 'center'
                }}>
                  <MaterialIcons name="schedule" size={24} color={COLORS.primary} />
                  <Text style={{fontSize: 24, fontWeight: 'bold', color: COLORS.black, marginTop: 5}}>
                    {etaMinutes || '--'}
                  </Text>
                  <Text style={{fontSize: 11, color: COLORS.gray, marginTop: 2}}>min ETA</Text>
                </View>

                <View style={{
                  flex: 1,
                  backgroundColor: COLORS.background,
                  padding: 15,
                  borderRadius: 15,
                  marginLeft: 8,
                  alignItems: 'center'
                }}>
                  <MaterialIcons name="straighten" size={24} color={COLORS.primary} />
                  <Text style={{fontSize: 24, fontWeight: 'bold', color: COLORS.black, marginTop: 5}}>
                    {distanceRemaining?.toFixed(1) || '--'}
                  </Text>
                  <Text style={{fontSize: 11, color: COLORS.gray, marginTop: 2}}>km remaining</Text>
                </View>
              </View>

              {/* Route Info */}
              <View style={{
                backgroundColor: COLORS.background,
                padding: 15,
                borderRadius: 15,
                marginBottom: 10
              }}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                  <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.green, marginRight: 10}} />
                  <Text style={{fontSize: 12, color: COLORS.gray, flex: 1}} numberOfLines={1}>
                    {rideData.pickupAddress}
                  </Text>
                </View>
                <View style={{width: 2, height: 20, backgroundColor: COLORS.lightGray, marginLeft: 5, marginBottom: 5}} />
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.red, marginRight: 10}} />
                  <Text style={{fontSize: 12, color: COLORS.gray, flex: 1}} numberOfLines={1}>
                    {rideData.dropoffAddress}
                  </Text>
                </View>
              </View>

              {/* Driver Info Quick View */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: COLORS.background,
                padding: 12,
                borderRadius: 12
              }}>
                {rideData.driverPhoto ? (
                  <Image source={{uri: rideData.driverPhoto}} style={{width: 40, height: 40, borderRadius: 20, marginRight: 12}} />
                ) : (
                  <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center', marginRight: 12}}>
                    <MaterialIcons name="person" size={20} color={COLORS.gray} />
                  </View>
                )}
                <View style={{flex: 1}}>
                  <Text style={{fontSize: 14, fontWeight: '600', color: COLORS.black}}>
                    {rideData.driverName}
                  </Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 2}}>
                    <MaterialIcons name="star" size={14} color={COLORS.yellow} />
                    <Text style={{fontSize: 12, color: COLORS.gray, marginLeft: 4}}>
                      {rideData.rating?.toFixed(1) || '5.0'} • {rideData.licensePlate}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="phone" size={20} color={COLORS.primary} />
              </View>
            </View>
          )}

          {/* Simple Status for Accepted */}
          {!isDriver && rideStatus === 'accepted' && (
            <View style={{
              padding: 15,
              paddingHorizontal: 20,
              backgroundColor: COLORS.white,
              borderTopWidth: 1,
              borderTopColor: COLORS.lightGray
            }}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <View style={{flex: 1}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 5}}>
                    <MaterialIcons name="person-pin-circle" size={20} color={COLORS.primary} style={{marginRight: 8}} />
                    <Text style={{fontSize: 14, fontWeight: '600', color: COLORS.black}}>
                      Driver is on the way to pickup location
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Rating modal will show automatically - no need for button */}

          {!isDriver && rideStatus === 'completed' && rideData.riderRating && (
            <View style={{padding: 15, paddingHorizontal: 20, alignItems: 'center'}}>
              <MaterialIcons name="check-circle" size={50} color={COLORS.green} />
              <Text style={{fontSize: 18, fontWeight: 'bold', color: COLORS.green, marginTop: 10, textAlign: 'center'}}>
                Thank You!
              </Text>
              <Text style={{color: COLORS.gray, marginTop: 5, textAlign: 'center', paddingHorizontal: 15}}>
                Your rating has been submitted
              </Text>
              <TouchableOpacity 
                style={[styles.primaryBtn, {marginTop: 15, width: '100%', maxWidth: 300}]} 
                onPress={() => {
                  // Dismiss keyboard if open
                  Keyboard.dismiss();
                  // Force navigation to Main screen - override any other logic
                  // Use reset to ensure we go back to Main and clear navigation stack
                  navigation.dispatch(
                    CommonActions.reset({
                      index: 0,
                      routes: [{ name: 'Main' }],
                    })
                  );
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Modal 
          visible={showRatingModal} 
          transparent 
          animationType="fade"
          onRequestClose={() => {
            // Prevent closing without rating - show alert instead
            Alert.alert(
              "Rating Required",
              "Please rate your ride experience to continue.",
              [{ text: "OK" }]
            );
          }}
          statusBarTranslucent={true}
        >
          <View style={[styles.modalOverlay, {backgroundColor: 'rgba(0,0,0,0.85)'}]}>
            <TouchableWithoutFeedback onPress={() => {
              Alert.alert(
                "Rating Required",
                "Please rate your ride experience to continue.",
                [{ text: "OK" }]
              );
            }}>
              <View style={[styles.ratingModalContent, {
                backgroundColor: COLORS.white,
                borderRadius: 25,
                padding: 30,
                maxWidth: '90%',
                width: 400,
                shadowColor: '#000',
                shadowOffset: {width: 0, height: 10},
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 20
              }]}>
                <View style={{alignItems: 'center', marginBottom: 20}}>
                  <View style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: COLORS.yellow + '20',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 15
                  }}>
                    <MaterialIcons name="star" size={50} color={COLORS.yellow} />
                  </View>
                  <Text style={[styles.modalTitle, {fontSize: 24, marginBottom: 8, fontWeight: 'bold'}]}>Rate Your Ride</Text>
                  <Text style={[styles.ratingSubtitle, {fontSize: 14, textAlign: 'center', color: COLORS.gray}]}>
                    How was your experience with {rideData.driverName}?
                  </Text>
                </View>

              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    style={styles.starButton}
                  >
                    <MaterialIcons
                      name={star <= rating ? "star" : "star-border"}
                      size={38}
                      color={star <= rating ? COLORS.yellow : COLORS.gray}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.ratingText}>
                {rating === 1 ? "Poor" : 
                 rating === 2 ? "Fair" : 
                 rating === 3 ? "Good" : 
                 rating === 4 ? "Very Good" : 
                 "Excellent"}
              </Text>

              <TextInput
                style={styles.feedbackInput}
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Add feedback (optional)"
                placeholderTextColor={COLORS.gray}
                multiline
                numberOfLines={3}
                maxLength={200}
              />

              <TouchableOpacity 
                style={styles.submitRatingButton} 
                onPress={submitRating}
              >
                <Text style={styles.btnText}>Submit Rating</Text>
              </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RideHistoryScreen({ navigation }) {
  const { user, userRole } = useContext(AuthContext);
  const [rideHistory, setRideHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRide, setSelectedRide] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (!user) return;

    const field = userRole === 'driver' ? 'driverId' : 'riderId';
    
    const q = query(
      collection(db, "bookings"),
      where(field, "==", user.uid),
      where("status", "==", "completed"),
      orderBy("completedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const rides = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRideHistory(rides);
      setLoading(false);
    });

    return unsub;
  }, [user, userRole]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const viewRideDetails = (ride) => {
    setSelectedRide(ride);
    setShowDetailsModal(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride History</Text>
        <View style={{width: 24}} />
      </View>

      <FlatList
        data={rideHistory}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="history" size={60} color={COLORS.gray} />
            <Text style={styles.emptyText}>No completed rides yet</Text>
            <Text style={{color: COLORS.gray, textAlign: 'center', marginTop: 5}}>
              Your completed rides will appear here
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <TouchableOpacity 
            style={styles.historyCard}
            onPress={() => viewRideDetails(item)}
          >
            <View style={styles.historyCardHeader}>
              <View style={{flex: 1}}>
                <Text style={styles.historyDate}>
                  {formatDate(item.completedAt)}
                </Text>
                <Text style={{color: COLORS.gray, fontSize: 12, marginTop: 2}}>
                  {item.distance} km • {item.categoryName}
                </Text>
              </View>
              <View style={styles.historyPriceBadge}>
                <Text style={styles.historyPriceText}>PKR {item.finalPrice}</Text>
              </View>
            </View>

            <View style={styles.historyRoute}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                <View style={[styles.locationDot, {backgroundColor: COLORS.green}]} />
                <Text style={styles.historyAddress} numberOfLines={1}>
                  {item.pickupAddress}
                </Text>
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <View style={[styles.locationDot, {backgroundColor: COLORS.red}]} />
                <Text style={styles.historyAddress} numberOfLines={1}>
                  {item.dropoffAddress}
                </Text>
              </View>
            </View>

            {userRole === 'driver' && (
              <View style={styles.historyFooter}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <MaterialIcons name="person" size={16} color={COLORS.gray} />
                  <Text style={{marginLeft: 5, color: COLORS.gray, fontSize: 13}}>
                    {item.riderName}
                  </Text>
                </View>
                {item.riderRating && (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <MaterialIcons name="star" size={16} color={COLORS.yellow} />
                    <Text style={{marginLeft: 5, color: COLORS.gray, fontSize: 13}}>
                      {item.riderRating}/5
                    </Text>
                  </View>
                )}
              </View>
            )}

            {userRole === 'rider' && (
              <View style={styles.historyFooter}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <MaterialIcons name="person" size={16} color={COLORS.gray} />
                  <Text style={{marginLeft: 5, color: COLORS.gray, fontSize: 13}}>
                    {item.driverName}
                  </Text>
                </View>
                {item.riderRating && (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <MaterialIcons name="star" size={16} color={COLORS.yellow} />
                    <Text style={{marginLeft: 5, color: COLORS.gray, fontSize: 13}}>
                      Rated {item.riderRating}/5
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.viewDetailsButton}>
              <Text style={{color: COLORS.primary, fontSize: 13, fontWeight: '600'}}>
                View Details
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Ride Details Modal */}
      <Modal visible={showDetailsModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowDetailsModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.rideDetailsModal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Ride Details</Text>
                  <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                    <MaterialIcons name="close" size={24} color={COLORS.gray} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {selectedRide && (
                    <>
                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Date & Time</Text>
                        <Text style={styles.detailValue}>
                          {formatDate(selectedRide.completedAt)}
                        </Text>
                      </View>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Route</Text>
                        <View style={{marginTop: 8}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                            <View style={[styles.locationDot, {backgroundColor: COLORS.green}]} />
                            <Text style={styles.detailValue}>{selectedRide.pickupAddress}</Text>
                          </View>
                          <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <View style={[styles.locationDot, {backgroundColor: COLORS.red}]} />
                            <Text style={styles.detailValue}>{selectedRide.dropoffAddress}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Distance</Text>
                        <Text style={styles.detailValue}>{selectedRide.distance} km</Text>
                      </View>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Vehicle Category</Text>
                        <Text style={styles.detailValue}>{selectedRide.categoryName}</Text>
                      </View>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Fare</Text>
                        <Text style={[styles.detailValue, {color: COLORS.primary, fontSize: 20, fontWeight: 'bold'}]}>
                          PKR {selectedRide.finalPrice}
                        </Text>
                      </View>

                      {userRole === 'driver' && (
                        <>
                          <View style={styles.detailSection}>
                            <Text style={styles.detailLabel}>Passenger Details</Text>
                            <Text style={styles.detailValue}>{selectedRide.riderName}</Text>
                            {selectedRide.riderPhone && (
                              <Text style={{color: COLORS.gray, fontSize: 14, marginTop: 5}}>
                                {selectedRide.riderPhone}
                              </Text>
                            )}
                          </View>

                          {selectedRide.riderRating && (
                            <View style={styles.detailSection}>
                              <Text style={styles.detailLabel}>Rating Received</Text>
                              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <MaterialIcons
                                    key={star}
                                    name="star"
                                    size={24}
                                    color={star <= selectedRide.riderRating ? COLORS.yellow : COLORS.lightGray}
                                    style={{marginRight: 5}}
                                  />
                                ))}
                                <Text style={{marginLeft: 10, fontSize: 16, fontWeight: 'bold'}}>
                                  {selectedRide.riderRating}/5
                                </Text>
                              </View>
                              {selectedRide.riderFeedback && (
                                <Text style={styles.feedbackText}>
                                  "{selectedRide.riderFeedback}"
                                </Text>
                              )}
                            </View>
                          )}
                        </>
                      )}

                      {userRole === 'rider' && (
                        <>
                          <View style={styles.detailSection}>
                            <Text style={styles.detailLabel}>Driver Details</Text>
                            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8}}>
                              {selectedRide.driverPhoto ? (
                                <Image
                                  source={{uri: selectedRide.driverPhoto}}
                                  style={{width: 50, height: 50, borderRadius: 25, marginRight: 15}}
                                />
                              ) : (
                                <View style={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: 25,
                                  backgroundColor: COLORS.lightGray,
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  marginRight: 15
                                }}>
                                  <MaterialIcons name="person" size={24} color={COLORS.gray} />
                                </View>
                              )}
                              <View>
                                <Text style={styles.detailValue}>{selectedRide.driverName}</Text>
                                <Text style={{color: COLORS.gray, fontSize: 13, marginTop: 2}}>
                                  {selectedRide.licensePlate}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {selectedRide.riderRating && (
                            <View style={styles.detailSection}>
                              <Text style={styles.detailLabel}>Your Rating</Text>
                              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <MaterialIcons
                                    key={star}
                                    name="star"
                                    size={24}
                                    color={star <= selectedRide.riderRating ? COLORS.yellow : COLORS.lightGray}
                                    style={{marginRight: 5}}
                                  />
                                ))}
                                <Text style={{marginLeft: 10, fontSize: 16, fontWeight: 'bold'}}>
                                  {selectedRide.riderRating}/5
                                </Text>
                              </View>
                              {selectedRide.riderFeedback && (
                                <Text style={styles.feedbackText}>
                                  "{selectedRide.riderFeedback}"
                                </Text>
                              )}
                            </View>
                          )}
                        </>
                      )}

                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Status</Text>
                        <View style={styles.completedBadge}>
                          <MaterialIcons name="check-circle" size={18} color={COLORS.green} />
                          <Text style={{color: COLORS.green, fontWeight: 'bold', marginLeft: 5}}>
                            Completed
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}
function ContactScreen({ navigation }) {
  const openWebsite = () => {
    const url = 'https://aaammm.netlify.app';
    Alert.alert(
      "Open Website",
      "This will open the Aam Rides website in your browser.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open", onPress: () => {
          // In React Native, you'd use Linking.openURL(url)
          // For now, we'll show the URL
          Alert.alert("Website", url);
        }}
      ]
    );
  };

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <MaterialIcons name="menu" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView contentContainerStyle={{padding: 20}}>
        <View style={styles.contactCard}>
          <MaterialIcons name="business" size={40} color={COLORS.primary} />
          <Text style={styles.contactTitle}>Office Location</Text>
          <Text style={styles.contactText}>
            World Trade Center Complex{'\n'}
            94th Floor, Lower Manhattan{'\n'}
            New York
          </Text>
        </View>

        <View style={styles.contactCard}>
          <MaterialIcons name="phone" size={40} color={COLORS.primary} />
          <Text style={styles.contactTitle}>Contact Number</Text>
          <Text style={styles.contactText}>+1 (420) 9211420</Text>
        </View>

        <View style={styles.contactCard}>
          <MaterialIcons name="language" size={40} color={COLORS.primary} />
          <Text style={styles.contactTitle}>Website</Text>
          <TouchableOpacity onPress={openWebsite} style={styles.websiteButton}>
            <Text style={styles.websiteText}>https://aaammm.netlify.app</Text>
            <MaterialIcons name="open-in-new" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.contactCard}>
          <MaterialIcons name="email" size={40} color={COLORS.primary} />
          <Text style={styles.contactTitle}>Email Support</Text>
          <Text style={styles.contactText}>
            For any queries or support, please use our complaint form or contact us directly.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
// Complaint Screen
function ComplaintScreen({ navigation }) {
  const { user, userRole } = useContext(AuthContext);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!user) return;

    const collection = userRole === 'driver' ? 'drivers' : 'riders';
    const unsub = onSnapshot(doc(db, collection, user.uid), (snap) => {
      if (snap.exists()) {
        setUserData(snap.data());
      }
    });

    return unsub;
  }, [user, userRole]);

  const submitComplaint = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Error", "Please fill in both subject and message");
      return;
    }

    setLoading(true);
    
    try {
      // 1. Prepare the data strictly for the REST API
      const emailData = {
        service_id: EMAILJS_CONFIG.serviceId,
        template_id: EMAILJS_CONFIG.templateId,
        user_id: EMAILJS_CONFIG.publicKey,
        accessToken: EMAILJS_CONFIG.privateKey, // <--- This authorizes the app!
        template_params: {
          from_name: userData?.name || 'User',
          from_email: userData?.email || user?.email || 'unknown@email.com',
          user_type: userRole,
          subject: subject.trim(),
          message: message.trim(),
          user_phone: userData?.phone || 'Not provided',
          submission_date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        }
      };

      // 2. Use fetch instead of emailjs.send
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });

      // 3. Check response manually
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error("EmailJS Error: " + errorText);
      }

      // 4. Success Layout
      Alert.alert(
        "Success", 
        "Your complaint has been submitted successfully. We will get back to you soon.",
        [
          { 
            text: "OK", 
            onPress: () => {
              setSubject('');
              setMessage('');
              navigation.goBack();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Complaint Submit Error:', error);
      Alert.alert("Error", "Failed to submit complaint. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Complaint & Suggestions</Text>
        <View style={{width: 24}} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{flex: 1}}
      >
        <ScrollView contentContainerStyle={{padding: 20}}>
          <View style={styles.complaintHeader}>
            <MaterialIcons name="feedback" size={50} color={COLORS.primary} />
            <Text style={styles.complaintTitle}>We Value Your Feedback</Text>
            <Text style={styles.complaintSubtitle}>
              Help us improve by sharing your complaints or suggestions
            </Text>
          </View>

          <Text style={styles.formLabel}>Subject</Text>
          <TextInput
            style={styles.formInput}
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief description of your complaint/suggestion"
            maxLength={100}
          />

          <Text style={styles.formLabel}>Message</Text>
          <TextInput
            style={[styles.formInput, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="Please provide detailed information about your complaint or suggestion..."
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            maxLength={1000}
          />

          <Text style={styles.characterCount}>
            {message.length}/1000 characters
          </Text>

          <TouchableOpacity 
            style={[styles.primaryBtn, {marginTop: 20}, loading && {opacity: 0.5}]} 
            onPress={submitComplaint}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="white" style={{marginRight: 8}} />
                <Text style={styles.btnText}>Submit Complaint</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
// Ride Status Screen
function RideStatusScreen({ navigation }) {
  const { user, userRole } = useContext(AuthContext);
  const [scheduledRides, setScheduledRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const field = userRole === 'driver' ? 'driverId' : 'riderId';
    
    const q = query(
      collection(db, "bookings"),
      where(field, "==", user.uid),
      where("status", "in", ["searching", "negotiating", "accepted", "in_progress"])
    );

    const unsub = onSnapshot(q, (snap) => {
      const rides = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScheduledRides(rides);
      setLoading(false);
    });

    return unsub;
  }, [user, userRole]);

  const getStatusColor = (status) => {
    switch(status) {
      case 'searching': return COLORS.yellow;
      case 'negotiating': return COLORS.blue;
      case 'accepted': return COLORS.green;
      case 'in_progress': return COLORS.primary;
      default: return COLORS.gray;
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'searching': return 'Finding Drivers';
      case 'negotiating': return 'Receiving Offers';
      case 'accepted': return 'Driver Assigned';
      case 'in_progress': return 'Ride in Progress';
      default: return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <MaterialIcons name="menu" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Status</Text>
        <View style={{width: 24}} />
      </View>

      <FlatList
        data={scheduledRides}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="event-available" size={60} color={COLORS.gray} />
            <Text style={styles.emptyText}>No active rides</Text>
            <Text style={{color: COLORS.gray, textAlign: 'center', marginTop: 5}}>
              Your scheduled or ongoing rides will appear here
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusBadge, {backgroundColor: getStatusColor(item.status)}]}>
                <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
              </View>
              <Text style={styles.statusPrice}>PKR {item.finalPrice || item.estimatedFare}</Text>
            </View>

            <View style={styles.statusRoute}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                <View style={[styles.locationDot, {backgroundColor: COLORS.green}]} />
                <Text style={styles.statusAddress} numberOfLines={1}>
                  {item.pickupAddress}
                </Text>
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <View style={[styles.locationDot, {backgroundColor: COLORS.red}]} />
                <Text style={styles.statusAddress} numberOfLines={1}>
                  {item.dropoffAddress}
                </Text>
              </View>
            </View>

            <View style={styles.statusFooter}>
              <Text style={styles.statusTime}>
                {item.createdAt && new Date(item.createdAt.toDate()).toLocaleString()}
              </Text>
              {userRole === 'rider' && item.driverName && (
                <Text style={styles.statusDriver}>Driver: {item.driverName}</Text>
              )}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

// Custom Drawer Content
function CustomDrawerContent({ navigation, ...props }) {
  const { user, userRole } = useContext(AuthContext);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!user) return;

    const collection = userRole === 'driver' ? 'drivers' : 'riders';
    const unsub = onSnapshot(doc(db, collection, user.uid), (snap) => {
      if (snap.exists()) {
        setUserData(snap.data());
      }
    });

    return unsub;
  }, [user, userRole]);

  const photoUri = userRole === 'driver' ? userData?.driverPhoto : userData?.photo;

  return (
    <SafeAreaView style={styles.drawerContainer}>
      <View style={styles.drawerHeader}>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={styles.drawerProfilePhoto} />
          ) : (
            <View style={[styles.drawerProfilePhoto, {backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center'}]}>
              <MaterialIcons name="person" size={30} color={COLORS.gray} />
            </View>
          )}
        </TouchableOpacity>
        
        <View style={{flex: 1, marginLeft: 15}}>
          <Text style={styles.drawerUserName}>{userData?.name || 'Loading...'}</Text>
          <Text style={styles.drawerUserEmail}>{userData?.email || user?.email}</Text>
          <View style={styles.drawerUserBadge}>
            <Text style={styles.drawerUserType}>
              {userRole === 'driver' ? '🚗 Captain' : '🚶 Rider'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.drawerMenu}>
        <TouchableOpacity 
          style={styles.drawerMenuItem} 
          onPress={() => navigation.navigate('Profile')}
        >
          <MaterialIcons name="person" size={24} color={COLORS.gray} />
          <Text style={styles.drawerMenuText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.drawerMenuItem} 
          onPress={() => navigation.navigate('RideHistory')}
        >
          <MaterialCommunityIcons name="history" size={24} color={COLORS.gray} />
          <Text style={styles.drawerMenuText}>Ride History</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.drawerMenuItem} 
          onPress={() => navigation.navigate('RideStatus')}
        >
          <MaterialIcons name="event-available" size={24} color={COLORS.gray} />
          <Text style={styles.drawerMenuText}>Ride Status</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.drawerMenuItem} 
          onPress={() => navigation.navigate('Contact')}
        >
          <MaterialIcons name="contact-phone" size={24} color={COLORS.gray} />
          <Text style={styles.drawerMenuText}>Contact Us</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.drawerMenuItem} 
          onPress={() => navigation.navigate('Complaint')}
        >
          <MaterialIcons name="feedback" size={24} color={COLORS.gray} />
          <Text style={styles.drawerMenuText}>Complaints & Suggestions</Text>
        </TouchableOpacity>

        <View style={styles.drawerDivider} />

        <TouchableOpacity 
          style={styles.drawerMenuItem} 
          onPress={() => signOut(auth)}
        >
          <MaterialIcons name="logout" size={24} color={COLORS.red} />
          <Text style={[styles.drawerMenuText, {color: COLORS.red}]}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}



// 7. PROFILE SCREEN
function ProfileScreen({ navigation }) {
  const { user, userRole } = useContext(AuthContext);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!user) return;

    const collection = userRole === 'driver' ? 'drivers' : 'riders';
    const unsub = onSnapshot(doc(db, collection, user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        setName(data.name || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
      }
    });

    return unsub;
  }, [user, userRole]);

  const pickProfilePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const collection = userRole === 'driver' ? 'drivers' : 'riders';
      
      try {
        await updateDoc(doc(db, collection, user.uid), {
          [userRole === 'driver' ? 'driverPhoto' : 'photo']: base64Img
        });
        Alert.alert("Success", "Profile photo updated");
      } catch (error) {
        Alert.alert("Error", "Failed to update photo");
      }
    }
  };

  const saveProfile = async () => {
    setLoading(true);
    const collection = userRole === 'driver' ? 'drivers' : 'riders';
    
    try {
      await updateDoc(doc(db, collection, user.uid), {
        name,
        phone,
        address
      });
      Alert.alert("Success", "Profile updated successfully");
    } catch (error) {
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  if (!userData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const photoUri = userRole === 'driver' ? userData.driverPhoto : userData.photo;

  return (
    <SafeAreaView style={styles.whiteContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <MaterialIcons name="menu" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity onPress={() => signOut(auth)}>
          <MaterialIcons name="logout" size={24} color={COLORS.red} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{padding: 20}} showsVerticalScrollIndicator={false}>
        <View style={{alignItems: 'center', marginBottom: 30}}>
          <TouchableOpacity onPress={pickProfilePhoto} style={{position: 'relative'}}>
            {photoUri ? (
              <Image source={{uri: photoUri}} style={styles.profilePhoto} />
            ) : (
              <View style={[styles.profilePhoto, {backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center'}]}>
                <MaterialIcons name="person" size={60} color={COLORS.gray} />
              </View>
            )}
            <View style={styles.editPhotoIcon}>
              <MaterialIcons name="camera-alt" size={16} color="white" />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.profileName}>{userData.name}</Text>
          <Text style={styles.profileEmail}>{userData.email}</Text>
          
          {userRole === 'driver' && (
            <View style={styles.driverBadge}>
              <MaterialCommunityIcons name="car" size={16} color={COLORS.primary} />
              <Text style={{color: COLORS.primary, fontWeight: 'bold', marginLeft: 5}}>
                {userData.category?.name || 'Driver'}
              </Text>
            </View>
          )}
        </View>

        {userRole === 'driver' && (
          <View style={styles.profileStats}>
            <View style={styles.profileStatBox}>
              <MaterialCommunityIcons name="car-multiple" size={24} color={COLORS.primary} />
              <Text style={styles.statValue}>{userData.totalRides || 0}</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
            <View style={styles.profileStatBox}>
              <MaterialIcons name="star" size={24} color={COLORS.yellow} />
              <Text style={styles.statValue}>{userData.rating?.toFixed(1) || '5.0'}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.profileStatBox}>
              <MaterialCommunityIcons name="cash" size={24} color={COLORS.green} />
              <Text style={styles.statValue}>PKR {userData.earnings || 0}</Text>
              <Text style={styles.statLabel}>Earnings</Text>
            </View>
          </View>
        )}

        <Text style={styles.formLabel}>Full Name</Text>
        <TextInput style={styles.formInput} value={name} onChangeText={setName} />

        <Text style={styles.formLabel}>Phone Number</Text>
        <TextInput style={styles.formInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        <Text style={styles.formLabel}>Address</Text>
        <TextInput style={styles.formInput} value={address} onChangeText={setAddress} multiline numberOfLines={2} />

        {userRole === 'driver' && (
          <>
            <Text style={styles.formLabel}>Vehicle</Text>
            <View style={styles.vehicleInfoBox}>
              <Text style={{fontWeight: 'bold'}}>{userData.make} {userData.model}</Text>
              <Text style={{color: COLORS.gray}}>{userData.licensePlate}</Text>
              <Text style={{color: COLORS.gray, fontSize: 12}}>
                {userData.vehicleType} • {userData.hasAC ? 'AC' : 'Non-AC'}
              </Text>
            </View>

            {userData.vehiclePhoto && (
              <>
                <Text style={styles.formLabel}>Vehicle Photo</Text>
                <Image source={{uri: userData.vehiclePhoto}} style={styles.vehiclePhotoPreview} />
              </>
            )}
          </>
        )}

        <TouchableOpacity style={[styles.primaryBtn, {marginTop: 30}]} onPress={saveProfile}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialIcons name="save" size={20} color="white" style={{marginRight: 8}} />
              <Text style={styles.btnText}>Save Changes</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.primaryBtn, {backgroundColor: COLORS.blue, marginTop: 30}]} 
          onPress={() => navigation.navigate('RideHistory')}
        >
          <MaterialCommunityIcons name="history" size={20} color="white" style={{marginRight: 8}} />
          <Text style={styles.btnText}>View Ride History</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// NAVIGATION
const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();
function RootNavigator() {
  const { user, userRole } = useContext(AuthContext);

  return (
    <NavigationContainer>
      {/* LOGIC CHANGE: 
        Only switch to Drawer if we have a User AND a known Role.
        If user is logged in but role is null (during signup), stay on AuthStack.
      */}
      {!user || !userRole ? (
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      ) : (
        <Drawer.Navigator 
          drawerContent={(props) => <CustomDrawerContent {...props} />}
          screenOptions={{
            headerShown: false,
            drawerPosition: 'left',
            drawerType: 'front',
            drawerStyle: { width: 280 }
          }}
        >
          <Drawer.Screen name="Main" component={MainScreen} />
          <Drawer.Screen name="Profile" component={ProfileScreen} />
          <Drawer.Screen name="RideHistory" component={RideHistoryScreen} />
          <Drawer.Screen name="RideStatus" component={RideStatusScreen} />
          <Drawer.Screen name="Contact" component={ContactScreen} />
          <Drawer.Screen name="Complaint" component={ComplaintScreen} />
        </Drawer.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  const [audioPlayed, setAudioPlayed] = useState(false);

  useEffect(() => {
    // Play audio once when app opens
    if (!audioPlayed) {
      const playAudio = async () => {
        try {
          // Set audio mode to allow playback
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
          });

          // Load and play the audio file
          const { sound } = await Audio.Sound.createAsync(
            require('./assets/AL.m4a'),
            { shouldPlay: true }
          );

          // Mark as played
          setAudioPlayed(true);

          // Clean up when sound finishes playing
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.didJustFinish) {
              sound.unloadAsync();
            }
          });
        } catch (error) {
          console.log('Error playing audio:', error);
        }
      };

      playAudio();
    }
  }, [audioPlayed]);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  whiteContainer: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, padding: 20 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  logoContainerShadow: { 
    shadowColor: '#000', 
    shadowOffset: {width: 0, height: 10}, 
    shadowOpacity: 0.3, 
    shadowRadius: 20, 
    elevation: 15 
  },
  logoContainer: { 
    backgroundColor: COLORS.white, 
    padding: 30, 
    borderRadius: 70, 
    marginBottom: 20 
  },
  logoImage: { width: 100, height: 100 },
  title: { 
    fontSize: 48, 
    fontWeight: '900', 
    color: COLORS.white, 
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 4,
    textAlign: 'center'
  },
  slogan: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#FFF8E1', 
    marginTop: 8,
    textAlign: 'center'
  },
  bottomArea: { 
    padding: 30, 
    paddingBottom: Platform.OS === 'ios' ? 50 : 30, 
    width: '100%' 
  },
  whiteBtn: { 
    backgroundColor: COLORS.white, 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    flexDirection: 'row', 
    justifyContent: 'center', 
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 5
  },
  glassBtn: { 
    backgroundColor: 'rgba(255,255,255,0.25)', 
    borderWidth: 2, 
    borderColor: 'rgba(255,255,255,0.6)', 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginTop: 15, 
    flexDirection: 'row', 
    justifyContent: 'center' 
  },
  orangeText: { 
    color: COLORS.primary, 
    fontSize: 16, 
    fontWeight: 'bold'
  },
  whiteBtnText: { 
    color: COLORS.white, 
    fontSize: 16, 
    fontWeight: 'bold'
  },

  authHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: COLORS.black
  },
  authTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: COLORS.black,
    textAlign: 'center'
  },
  input: { 
    backgroundColor: COLORS.lightGray, 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 15, 
    fontSize: 16,
    color: COLORS.black
  },
  driverSection: { 
    backgroundColor: '#FFF8E1', 
    padding: 20, 
    borderRadius: 15, 
    marginTop: 10,
    marginBottom: 15
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginBottom: 15,
    color: COLORS.black
  },
  label: { 
    fontWeight: '600', 
    marginBottom: 8, 
    marginTop: 10,
    color: COLORS.gray,
    fontSize: 14
  },
  pillContainer: { 
    flexDirection: 'row', 
    gap: 8, 
    marginVertical: 10 
  },
  pill: { 
    flex: 1, 
    alignItems: 'center', 
    paddingVertical: 12, 
    borderWidth: 2, 
    borderColor: COLORS.gray, 
    borderRadius: 10 
  },
  pillActive: { 
    backgroundColor: COLORS.primary, 
    borderColor: COLORS.primary 
  },
  pillText: { 
    fontWeight: '600', 
    color: COLORS.black, 
    fontSize: 14 
  },
  checkboxRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 15,
    padding: 10
  },
  categoryBadge: { 
    backgroundColor: COLORS.white, 
    padding: 15, 
    borderRadius: 10, 
    marginTop: 15,
    borderWidth: 1,
    borderColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  categoryText: { 
    color: COLORS.primary, 
    fontWeight: 'bold',
    textAlign: 'center'
  },
  photoUploadBox: { 
    width: '100%', 
    height: 150, 
    backgroundColor: COLORS.white, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 8,
    marginBottom: 15,
    borderWidth: 2, 
    borderColor: COLORS.lightGray,
    borderStyle: 'dashed',
    overflow: 'hidden'
  },
  uploadedImage: { 
    width: '100%', 
    height: '100%' 
  },
  uploadPlaceholder: { 
    alignItems: 'center' 
  },
  primaryBtn: { 
    backgroundColor: COLORS.primary, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 15,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5
  },
  btnText: { 
    color: COLORS.white, 
    fontSize: 16, 
    fontWeight: 'bold' 
  },

  modalOverlay: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20
  },
  modalContent: { 
    width: '100%', 
    maxWidth: 400,
    backgroundColor: COLORS.white, 
    padding: 30, 
    borderRadius: 20, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20
  },
  modalTitle: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    marginTop: 15,
    marginBottom: 10,
    color: COLORS.black,
    textAlign: 'center'
  },
  modalText: { 
    textAlign: 'center', 
    color: COLORS.gray, 
    lineHeight: 22,
    marginBottom: 20
  },

  pendingTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    marginTop: 20,
    marginBottom: 10,
    color: COLORS.black,
    textAlign: 'center'
  },
  pendingText: { 
    textAlign: 'center', 
    color: COLORS.gray, 
    paddingHorizontal: 20,
    lineHeight: 22
  },

  dashboardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    backgroundColor: COLORS.white
  },
  statsContainer: { 
    flexDirection: 'row', 
    padding: 15,
    backgroundColor: COLORS.background
  },
  statBox: { 
    flex: 1, 
    alignItems: 'center', 
    padding: 15,
    backgroundColor: COLORS.white,
    marginHorizontal: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  statValue: { 
    fontSize: 18, 
    fontWeight: 'bold',
    color: COLORS.black,
    marginTop: 8
  },
  statLabel: { 
    color: COLORS.gray, 
    fontSize: 12,
    marginTop: 5
  },
  requestCard: { 
    backgroundColor: COLORS.white, 
    padding: 20, 
    borderRadius: 15, 
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
    marginBottom: 15
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: 'bold',
    color: COLORS.black,
    flex: 1,       // FIXED: Allow taking space
    flexShrink: 1, // FIXED: Allow wrapping/truncating
    marginRight: 10
  },
  priceBadge: { 
    backgroundColor: '#E8F5E9', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 8 
  },
  priceText: { 
    color: COLORS.green, 
    fontWeight: 'bold',
    fontSize: 15
  },
  routeContainer: { 
    marginVertical: 10 
  },
  routeRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    marginVertical: 5
  },
  routeDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    marginRight: 10 
  },
  routeLine: { 
    width: 2, 
    height: 20, 
    backgroundColor: COLORS.lightGray, 
    marginLeft: 4,
    marginVertical: 2
  },
  routeText: { 
    flex: 1,
    color: COLORS.black,
    fontSize: 14,
    flexShrink: 1 // FIXED: Ensures long addresses don't push content off screen
  },
  infoChip: { 
    flexDirection: 'row', 
    alignItems: 'center',
    backgroundColor: COLORS.lightGray,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  bidButton: { 
    backgroundColor: COLORS.primary, 
    padding: 14, 
    borderRadius: 10, 
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 15
  },
  emptyState: { 
    alignItems: 'center', 
    marginTop: 100 
  },
  emptyText: { 
    color: COLORS.gray, 
    fontSize: 16,
    marginTop: 15,
    fontWeight: '600'
  },

  bidModalContent: { 
    width: '100%', 
    maxWidth: 400,
    backgroundColor: COLORS.white, 
    padding: 25, 
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20
  },
  fareInfo: { 
    alignItems: 'center', 
    marginVertical: 15,
    padding: 15,
    backgroundColor: COLORS.lightGray,
    borderRadius: 10,
    width: '100%'
  },
  estimatedFare: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: COLORS.primary,
    marginTop: 5
  },
  bidInput: { 
    borderWidth: 2, 
    borderColor: COLORS.primary, 
    fontSize: 24, 
    textAlign: 'center', 
    padding: 15, 
    borderRadius: 12,
    marginBottom: 20,
    fontWeight: 'bold',
    color: COLORS.black
  },
  modalButton: { 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100
  },

  map: { 
    flex: 1 
  },
  profileButton: { 
    position: 'absolute', 
    top: Platform.OS === 'android' ? 50 : 60, 
    right: 20, 
    backgroundColor: COLORS.white, 
    padding: 12, 
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5
  },
  markerContainer: { 
    alignItems: 'center' 
  },
  markerDot: { 
    width: 20, 
    height: 20, 
    borderRadius: 10,
    borderWidth: 3, 
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5
  },

  bottomSheet: { 
    position: 'absolute', 
    bottom: 0, 
    width: '100%', 
    backgroundColor: COLORS.white, 
    borderTopLeftRadius: 25, 
    borderTopRightRadius: 25, 
    padding: 20,
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 20
  },
   
  sheetTitle: { 
    fontSize: 20, 
    fontWeight: 'bold',
    color: COLORS.black,
    marginBottom: 20
  },

  sheetHeader: { 
    flexDirection: 'row', 
    alignItems: 'center',
    marginBottom: 20
  },

  locationInputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.lightGray, 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 10 
  },
  locationDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    marginRight: 10 
  },
  locationInput: { 
    flex: 1, 
    fontSize: 15,
    color: COLORS.black
  },
  suggestionItem: { 
    flexDirection: 'row', 
    alignItems: 'center',
    padding: 15, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.lightGray 
  },
  suggestionText: { 
    flex: 1, 
    marginLeft: 10,
    color: COLORS.black,
    fontSize: 14
  },
  currentLocationButton: { 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    marginTop: 10
  },
  continueButton: { 
    backgroundColor: COLORS.primary, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 20
  },

  categoryCard: { 
    width: 140, 
    padding: 20, 
    backgroundColor: COLORS.white, 
    borderRadius: 15, 
    marginRight: 15,
    borderWidth: 2, 
    borderColor: COLORS.lightGray, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  categoryCardActive: { 
    borderColor: COLORS.primary, 
    backgroundColor: '#FFF3E0' 
  },
  categoryName: { 
    fontWeight: 'bold', 
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.black
  },
  categoryPrice: { 
    color: COLORS.primary, 
    fontWeight: 'bold', 
    fontSize: 16,
    marginTop: 5
  },
  fareBreakdown: { 
    backgroundColor: COLORS.lightGray, 
    padding: 20, 
    borderRadius: 12,
    marginBottom: 15
  },
  fareLabel: { 
    color: COLORS.gray, 
    fontSize: 14,
    marginBottom: 5
  },
  fareAmount: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: COLORS.primary 
  },
  fareNote: { 
    color: COLORS.gray, 
    fontSize: 12
  },
  requestButton: { 
    backgroundColor: COLORS.primary, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  errorContainer: { 
    alignItems: 'center', 
    padding: 30 
  },
  errorTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: COLORS.red,
    marginTop: 15,
    marginBottom: 10
  },
  errorText: { 
    textAlign: 'center', 
    color: COLORS.gray,
    lineHeight: 20
  },

  offersTitle: { 
    fontSize: 16, 
    fontWeight: 'bold',
    marginBottom: 15,
    color: COLORS.black
  },
  offerCard: { 
    backgroundColor: COLORS.background, 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.lightGray
  },

  driverPhoto: { 
    width: 50, 
    height: 50, 
    borderRadius: 25,
    marginRight: 10
  },
  vehiclePhoto: { 
    width: 80, 
    height: 50, 
    borderRadius: 8 
  },
  driverName: { 
    fontWeight: 'bold', 
    fontSize: 15,
    color: COLORS.black,
    flexShrink: 1, // FIXED: Prevents name from overflowing if long
    marginRight: 10
  },

  licensePlate: { 
    color: COLORS.gray, 
    fontSize: 12,
    marginTop: 3
  },
  licensePlateText: {
    color: COLORS.gray,
    fontSize: 12,
    marginTop: 3
  },
  offerPrice: { 
    fontSize: 17, 
    fontWeight: 'bold', 
    color: COLORS.primary,
    marginBottom: 8
  },
  acceptButton: { 
    backgroundColor: COLORS.green, 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderRadius: 8,
    minWidth: 85,
    alignItems: 'center'
  },

  rideHeader: { 
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },
  rideStatus: { 
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.black,
    marginBottom: 3
  },
  driverInfoCard: { 
    flexDirection: 'row', 
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },
  driverInfoPhoto: { 
    width: 50, 
    height: 50, 
    borderRadius: 25,
    marginRight: 15
  },
  driverInfoName: { 
    fontWeight: 'bold', 
    fontSize: 15,
    color: COLORS.black,
    marginBottom: 2,
    flexShrink: 1, // FIXED
    flexWrap: 'wrap'
  },
  vehicleInfoPhoto: { 
    width: 80, 
    height: 50, 
    borderRadius: 8 
  },
  actionButton: { 
    backgroundColor: COLORS.primary, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center'
  },
  chatHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },
  chatHeaderText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.black,
    marginLeft: 8
  },
  chatHeader: { 
    fontSize: 15, 
    fontWeight: 'bold',
    color: COLORS.black
  },
  messageBubble: { 
    padding: 10, 
    paddingHorizontal: 12,
    borderRadius: 15, 
    marginVertical: 4, 
    maxWidth: '80%',
    minWidth: '20%' // FIXED: Prevents bubble from being too thin on short text
  },
  myMessage: { 
    alignSelf: 'flex-end', 
    backgroundColor: COLORS.primary 
  },
  theirMessage: { 
    alignSelf: 'flex-start', 
    backgroundColor: COLORS.lightGray 
  },
  messageText: { 
    fontSize: 14,
    color: COLORS.black,
    lineHeight: 20,
    flexWrap: 'wrap' // FIXED: Ensures long words break to next line
  },
  messageInputContainer: { 
    flexDirection: 'row', 
    padding: 15, 
    borderTopWidth: 1, 
    borderTopColor: COLORS.lightGray,
    alignItems: 'center',
    backgroundColor: COLORS.white
  },
  messageInput: { 
    flex: 1, 
    backgroundColor: COLORS.lightGray, 
    padding: 12, 
    borderRadius: 20, 
    marginRight: 10,
    fontSize: 15,
    maxHeight: 100
  },

  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    backgroundColor: COLORS.white
  },
  profilePhoto: { 
    width: 120, 
    height: 120, 
    borderRadius: 60,
    borderWidth: 3, 
    borderColor: COLORS.primary
  },
  editPhotoIcon: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    backgroundColor: COLORS.primary, 
    padding: 10, 
    borderRadius: 20,
    borderWidth: 3, 
    borderColor: COLORS.white
  },
  profileName: { 
    fontSize: 24, 
    fontWeight: 'bold',
    marginTop: 15,
    color: COLORS.black,
    textAlign: 'center'
  },
  profileEmail: { 
    color: COLORS.gray,
    fontSize: 14,
    marginTop: 5
  },
  driverBadge: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0', 
    paddingHorizontal: 15, 
    paddingVertical: 8, 
    borderRadius: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.primary
  },
  profileStats: { 
    flexDirection: 'row', 
    backgroundColor: COLORS.background,
    padding: 15,
    marginBottom: 20
  },
  profileStatBox: { 
    flex: 1, 
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 15,
    marginHorizontal: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  formLabel: { 
    fontWeight: '600', 
    marginBottom: 8,
    marginTop: 15,
    color: COLORS.gray,
    fontSize: 14
  },
  formInput: { 
    backgroundColor: COLORS.lightGray, 
    padding: 15, 
    borderRadius: 12,
    fontSize: 15,
    color: COLORS.black
  },
  vehicleInfoBox: { 
    backgroundColor: COLORS.lightGray, 
    padding: 15, 
    borderRadius: 12 
  },
  ratingModalContent: { 
    width: '88%', 
    maxWidth: 400,
    backgroundColor: COLORS.white, 
    padding: 30, 
    borderRadius: 20, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20
  },
  ratingSubtitle: {
    textAlign: 'center',
    color: COLORS.gray,
    fontSize: 14,
    marginBottom: 20,
    paddingHorizontal: 10,
    lineHeight: 20
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 15,
    gap: 8
  },
  starButton: {
    padding: 5
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 15,
    textAlign: 'center'
  },
  feedbackInput: {
    width: '100%',
    backgroundColor: COLORS.lightGray,
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 15,
    minHeight: 70
  },
  submitRatingButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  pinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -50,
    zIndex: 999
  },
  
  pinConfirmContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 10,
    zIndex: 1000
  },
  
  pinButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5
  },

  previewAddressContainer: {
    position: 'absolute',
    top: '50%',
    left: '10%',
    right: '10%',
    marginTop: 10,
    alignItems: 'center',
    zIndex: 998,
    pointerEvents: 'none'
  },
  
  previewAddressBox: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%'
  },
  
  previewAddressText: {
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.black,
    fontWeight: '500',
    flex: 1
  },
  
  historyCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.lightGray
  },
  
  hamburgerButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 50 : 60,
    left: 20,
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5
  },

  drawerContainer: {
    flex: 1,
    backgroundColor: COLORS.white
  },

  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 30,
    backgroundColor: COLORS.primary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },

  drawerProfilePhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: COLORS.white
  },

  drawerUserName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white
  },

  drawerUserEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2
  },

  drawerUserBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: 'flex-start'
  },

  drawerUserType: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: 'bold'
  },

  drawerMenu: {
    flex: 1,
    paddingTop: 20
  },

  drawerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },

  drawerMenuText: {
    marginLeft: 15,
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '500'
  },

  drawerDivider: {
    height: 1,
    backgroundColor: COLORS.lightGray,
    marginVertical: 10
  },

  contactCard: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.lightGray
  },

  contactTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.black,
    marginTop: 15,
    marginBottom: 10,
    textAlign: 'center'
  },

  contactText: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 20
  },

  websiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGray,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10
  },

  websiteText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    marginRight: 8
  },

  complaintHeader: {
    alignItems: 'center',
    marginBottom: 30,
    paddingVertical: 20
  },

  complaintTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.black,
    marginTop: 15,
    textAlign: 'center'
  },

  complaintSubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
    lineHeight: 20
  },

  characterCount: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'right',
    marginTop: 5
  },

  statusCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.lightGray
  },

  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    flex: 1,
    marginRight: 10
  },

  statusText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center'
  },

  statusPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary
  },

  statusRoute: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10
  },

  statusAddress: {
    flex: 1,
    color: COLORS.black,
    fontSize: 13,
    marginLeft: 10,
    flexShrink: 1 // FIXED
  },

  statusFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    paddingTop: 10
  },

  statusTime: {
    fontSize: 12,
    color: COLORS.gray
  },

  statusDriver: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 5
  },
  
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },

  historyDate: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.black
  },

  historyPriceBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },

  historyPriceText: {
    color: COLORS.green,
    fontWeight: 'bold',
    fontSize: 14
  },

  historyRoute: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10
  },

  historyAddress: {
    flex: 1,
    color: COLORS.black,
    fontSize: 13,
    marginLeft: 10,
    flexShrink: 1 // FIXED
  },

  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray
  },

  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray
  },

  rideDetailsModal: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray
  },

  detailSection: {
    marginBottom: 20
  },

  detailLabel: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '600',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },

  detailValue: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '500'
  },

  feedbackText: {
    marginTop: 10,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    fontSize: 14,
    color: COLORS.gray,
    fontStyle: 'italic',
    lineHeight: 20
  },

  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 5
  },
  vehiclePhotoPreview: { 
    width: '100%', 
    height: 150, 
    borderRadius: 12, 
    marginTop: 8
  }
});