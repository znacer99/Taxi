import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import ErrorBoundary from './components/ErrorBoundary';
import { api, authApi, getAuthToken } from './utils/api';
import { API_ENDPOINTS, WS_ENDPOINTS } from './config/api';
import WebSocketManager from './utils/websocket';
import { 
  requestLocationPermission, 
  startLocationTracking, 
  stopLocationTracking 
} from './utils/location';
import { validateRegistration, sanitizeString } from './utils/validation';

function DriverApp() {
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [token, setToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [earnings, setEarnings] = useState(null);
  
  const locationSubscriptionRef = useRef(null);
  const wsManagerRef = useRef(null);
  const locationUpdateTimerRef = useRef(null);

  // Load token on mount
  useEffect(() => {
    loadStoredToken();
  }, []);

  const loadStoredToken = async () => {
    const storedToken = await getAuthToken();
    if (storedToken) {
      setToken(storedToken);
      await loadProfile();
      setScreen('dashboard');
    }
  };

  // Setup WebSocket when available
  useEffect(() => {
    if (isAvailable && profile?.id && token) {
      setupWebSocket();
    } else {
      cleanupWebSocket();
    }
    
    return () => cleanupWebSocket();
  }, [isAvailable, profile?.id, token]);

  // Location tracking
  useEffect(() => {
    if (isAvailable && profile) {
      startDriverLocationTracking();
    } else {
      stopDriverLocationTracking();
    }
    
    return () => stopDriverLocationTracking();
  }, [isAvailable, profile]);

  const setupWebSocket = () => {
    if (wsManagerRef.current) {
      wsManagerRef.current.close();
    }

    const wsUrl = WS_ENDPOINTS.DRIVER(profile.id, token);
    
    wsManagerRef.current = new WebSocketManager(wsUrl, {
      onOpen: () => console.log('Driver WebSocket connected'),
      onMessage: handleWebSocketMessage,
      onError: (error) => console.error('WebSocket error:', error),
      onClose: () => console.log('WebSocket closed'),
    });

    wsManagerRef.current.connect();
  };

  const cleanupWebSocket = () => {
    if (wsManagerRef.current) {
      wsManagerRef.current.close();
      wsManagerRef.current = null;
    }
  };

  const handleWebSocketMessage = (data) => {
    if (data.type === 'ride_update' && data.ride) {
      const status = data.ride.status;
      if (!['COMPLETED', 'CANCELLED'].includes(status)) {
        setActiveRide(data.ride);
        setScreen('ride');
      } else {
        setActiveRide(null);
        setScreen('dashboard');
        loadEarnings();
      }
    }
  };

  const startDriverLocationTracking = async () => {
    const permission = await requestLocationPermission();
    if (!permission.granted) {
      Alert.alert('Permission Required', permission.error);
      return;
    }

    try {
      const subscription = await startLocationTracking((location) => {
        setCurrentLocation({
          latitude: location.latitude,
          longitude: location.longitude,
        });
        
        // Send location to backend
        sendLocationUpdate(location.latitude, location.longitude);
      });
      
      locationSubscriptionRef.current = subscription;
    } catch (error) {
      console.error('Location tracking error:', error);
    }
  };

  const stopDriverLocationTracking = () => {
    if (locationSubscriptionRef.current) {
      stopLocationTracking(locationSubscriptionRef.current);
      locationSubscriptionRef.current = null;
    }
    
    if (locationUpdateTimerRef.current) {
      clearTimeout(locationUpdateTimerRef.current);
    }
  };

  const sendLocationUpdate = async (latitude, longitude) => {
    try {
      await api.post(API_ENDPOINTS.UPDATE_LOCATION, {
        latitude,
        longitude,
        is_available: isAvailable,
      });
    } catch (error) {
      console.error('Location update failed:', error);
    }
  };

  const loadProfile = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.DRIVER_PROFILE);
      const profileData = response.data;
      setProfile(profileData);
      setIsAvailable(profileData.is_available || false);
      await checkActiveRide();
    } catch (error) {
      setError('Failed to load profile');
      console.error(error);
    }
  };

  const checkActiveRide = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.RIDES);
      const rides = response.data || [];
      const active = rides.find(r => 
        !['COMPLETED', 'CANCELLED'].includes(r.status)
      );
      if (active) {
        setActiveRide(active);
        setScreen('ride');
      }
    } catch (error) {
      console.error('Check active ride error:', error);
    }
  };

  const loadEarnings = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.EARNINGS);
      setEarnings(response.data);
    } catch (error) {
      console.error('Load earnings error:', error);
    }
  };

  const handleLogin = async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(username, password);
      setToken(response.data.access);
      await loadProfile();
      setScreen('dashboard');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (formData) => {
    setLoading(true);
    setError('');
    
    const validation = validateRegistration(formData, true);
    if (!validation.isValid) {
      setError(Object.values(validation.errors)[0]);
      setLoading(false);
      return;
    }

    try {
      await authApi.registerDriver(formData);
      Alert.alert('Success', 'Registration successful! Please login.');
      setAuthMode('login');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    cleanupWebSocket();
    stopDriverLocationTracking();
    setToken(null);
    setProfile(null);
    setActiveRide(null);
    setIsAvailable(false);
    setScreen('auth');
  };

  const toggleAvailability = async () => {
    const newAvailability = !isAvailable;
    setIsAvailable(newAvailability);
    
    try {
      await api.post(API_ENDPOINTS.UPDATE_LOCATION, {
        latitude: currentLocation?.latitude || 0,
        longitude: currentLocation?.longitude || 0,
        is_available: newAvailability,
      });
    } catch (error) {
      setIsAvailable(!newAvailability);
      Alert.alert('Error', 'Failed to update availability');
    }
  };

  const handleAcceptRide = async () => {
    if (!activeRide) return;
    
    setLoading(true);
    try {
      await api.post(API_ENDPOINTS.ACCEPT_RIDE(activeRide.id));
      await checkActiveRide();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRide = async () => {
    if (!activeRide) return;
    
    setLoading(true);
    try {
      await api.post(API_ENDPOINTS.START_RIDE(activeRide.id));
      await checkActiveRide();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRide = async () => {
    if (!activeRide) return;
    
    setLoading(true);
    try {
      await api.post(API_ENDPOINTS.COMPLETE_RIDE(activeRide.id));
      setActiveRide(null);
      setScreen('dashboard');
      await loadEarnings();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;
    
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            setLoading(true);
            try {
              await api.post(API_ENDPOINTS.CANCEL_RIDE(activeRide.id));
              setActiveRide(null);
              setScreen('dashboard');
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Render screens
  if (screen === 'auth') {
    return <AuthScreen 
      mode={authMode}
      setMode={setAuthMode}
      onLogin={handleLogin}
      onRegister={handleRegister}
      loading={loading}
      error={error}
    />;
  }

  if (screen === 'dashboard') {
    return <DashboardScreen
      profile={profile}
      isAvailable={isAvailable}
      onToggleAvailability={toggleAvailability}
      currentLocation={currentLocation}
      earnings={earnings}
      onLoadEarnings={loadEarnings}
      onLogout={handleLogout}
      loading={loading}
    />;
  }

  if (screen === 'ride') {
    return <RideScreen
      ride={activeRide}
      currentLocation={currentLocation}
      onAccept={handleAcceptRide}
      onStart={handleStartRide}
      onComplete={handleCompleteRide}
      onCancel={handleCancelRide}
      loading={loading}
    />;
  }

  return null;
}

// Auth Screen Component
function AuthScreen({ mode, setMode, onLogin, onRegister, loading, error }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    phone_number: '',
    car_model: '',
    car_plate: '',
  });

  const handleSubmit = () => {
    if (mode === 'login') {
      onLogin(formData.username, formData.password);
    } else {
      onRegister(formData);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.authContainer}>
        <Text style={styles.title}>Driver {mode === 'login' ? 'Login' : 'Register'}</Text>
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={formData.username}
          onChangeText={(text) => setFormData({...formData, username: text})}
          autoCapitalize="none"
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={formData.password}
          onChangeText={(text) => setFormData({...formData, password: text})}
          secureTextEntry
        />
        
        {mode === 'register' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={formData.email}
              onChangeText={(text) => setFormData({...formData, email: text})}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={formData.phone_number}
              onChangeText={(text) => setFormData({...formData, phone_number: text})}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Car Model"
              value={formData.car_model}
              onChangeText={(text) => setFormData({...formData, car_model: text})}
            />
            <TextInput
              style={styles.input}
              placeholder="Car Plate"
              value={formData.car_plate}
              onChangeText={(text) => setFormData({...formData, car_plate: text})}
            />
          </>
        )}
        
        <TouchableOpacity 
          style={styles.button}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'login' ? 'Login' : 'Register'}
            </Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
          <Text style={styles.linkText}>
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Dashboard Screen Component  
function DashboardScreen({ 
  profile, 
  isAvailable, 
  onToggleAvailability, 
  currentLocation,
  earnings,
  onLoadEarnings,
  onLogout,
  loading 
}) {
  useEffect(() => {
    onLoadEarnings();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Driver Dashboard</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome, {profile?.user?.username}</Text>
          <Text style={styles.cardText}>Car: {profile?.car_model} ({profile?.car_plate})</Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.availabilityButton, isAvailable && styles.availabilityButtonActive]}
          onPress={onToggleAvailability}
        >
          <Text style={styles.availabilityButtonText}>
            {isAvailable ? '🟢 Available' : '🔴 Offline'}
          </Text>
        </TouchableOpacity>
        
        {currentLocation && (
          <MapView
            style={styles.map}
            region={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker coordinate={currentLocation} title="Your Location" />
          </MapView>
        )}
        
        {earnings && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Earnings</Text>
            <Text style={styles.earningsText}>${earnings.total_earnings}</Text>
            <Text style={styles.cardText}>Total Rides: {earnings.total_rides}</Text>
            <Text style={styles.cardText}>Avg per Ride: ${earnings.average_per_ride}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Ride Screen Component
function RideScreen({ ride, currentLocation, onAccept, onStart, onComplete, onCancel, loading }) {
  if (!ride) return null;

  const getActionButton = () => {
    switch (ride.status) {
      case 'ASSIGNED':
        return (
          <TouchableOpacity style={styles.button} onPress={onAccept} disabled={loading}>
            <Text style={styles.buttonText}>Accept Ride</Text>
          </TouchableOpacity>
        );
      case 'ACCEPTED':
        return (
          <TouchableOpacity style={styles.button} onPress={onStart} disabled={loading}>
            <Text style={styles.buttonText}>Start Ride</Text>
          </TouchableOpacity>
        );
      case 'IN_PROGRESS':
        return (
          <TouchableOpacity style={styles.button} onPress={onComplete} disabled={loading}>
            <Text style={styles.buttonText}>Complete Ride</Text>
          </TouchableOpacity>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Active Ride</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ride #{ride.id}</Text>
          <Text style={styles.statusBadge}>{ride.status}</Text>
          <Text style={styles.cardText}>Pickup: {ride.pickup_location}</Text>
          <Text style={styles.cardText}>Dropoff: {ride.dropoff_location}</Text>
          {ride.fare && <Text style={styles.cardText}>Fare: ${ride.fare}</Text>}
        </View>
        
        {ride.pickup_lat && ride.pickup_lng && currentLocation && (
          <MapView
            style={styles.map}
            region={{
              latitude: (ride.pickup_lat + currentLocation.latitude) / 2,
              longitude: (ride.pickup_lng + currentLocation.longitude) / 2,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker 
              coordinate={{ latitude: ride.pickup_lat, longitude: ride.pickup_lng }}
              title="Pickup"
              pinColor="green"
            />
            <Marker 
              coordinate={currentLocation}
              title="Your Location"
              pinColor="blue"
            />
          </MapView>
        )}
        
        {getActionButton()}
        
        <TouchableOpacity 
          style={[styles.button, styles.cancelButton]} 
          onPress={onCancel}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Cancel Ride</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  authContainer: { padding: 20 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 15, 
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  logoutText: { color: '#007AFF' },
  content: { padding: 15 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 8, 
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: { 
    backgroundColor: '#007AFF', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  cancelButton: { backgroundColor: '#FF3B30' },
  linkText: { color: '#007AFF', textAlign: 'center', marginTop: 15 },
  errorText: { color: '#FF3B30', marginBottom: 10, textAlign: 'center' },
  card: { 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 8, 
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  cardText: { fontSize: 14, color: '#666', marginBottom: 5 },
  availabilityButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  availabilityButtonActive: { backgroundColor: '#34C759' },
  availabilityButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  map: { height: 300, borderRadius: 8, marginBottom: 15 },
  earningsText: { fontSize: 32, fontWeight: 'bold', color: '#34C759', marginBottom: 10 },
  statusBadge: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: '#007AFF',
    marginBottom: 10,
  },
});

export default function DriverAppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <DriverApp />
    </ErrorBoundary>
  );
}
