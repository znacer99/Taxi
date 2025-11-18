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
  FlatList,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import ErrorBoundary from './components/ErrorBoundary';
import { api, authApi, getAuthToken } from './utils/api';
import { API_ENDPOINTS, WS_ENDPOINTS } from './config/api';
import WebSocketManager from './utils/websocket';
import { requestLocationPermission, getCurrentLocation } from './utils/location';
import { validateRideRequest, validateRegistration, sanitizeString, parseCoordinates } from './utils/validation';

function PassengerApp() {
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [token, setToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  
  const wsManagerRef = useRef(null);

  // Load token on mount
  useEffect(() => {
    loadStoredToken();
  }, []);

  const loadStoredToken = async () => {
    const storedToken = await getAuthToken();
    if (storedToken) {
      setToken(storedToken);
      await loadProfile();
      setScreen('home');
    }
  };

  // Setup WebSocket for active ride
  useEffect(() => {
    if (activeRide?.id && token) {
      setupWebSocket();
    } else {
      cleanupWebSocket();
    }
    
    return () => cleanupWebSocket();
  }, [activeRide?.id, token]);

  const setupWebSocket = () => {
    if (wsManagerRef.current) {
      wsManagerRef.current.close();
    }

    const wsUrl = WS_ENDPOINTS.RIDE(activeRide.id, token);
    
    wsManagerRef.current = new WebSocketManager(wsUrl, {
      onOpen: () => console.log('Ride WebSocket connected'),
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
      setActiveRide(data.ride);
      
      if (['COMPLETED', 'CANCELLED'].includes(data.ride.status)) {
        setActiveRide(null);
        setScreen('home');
        loadRideHistory();
      }
    }
  };

  const loadProfile = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.PASSENGER_PROFILE);
      const profileData = response.data;
      setProfile(profileData);
      await checkActiveRide();
      await loadRideHistory();
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

  const loadRideHistory = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.RIDES);
      const rides = response.data || [];
      setRideHistory(rides.filter(r => ['COMPLETED', 'CANCELLED'].includes(r.status)));
    } catch (error) {
      console.error('Load history error:', error);
    }
  };

  const handleLogin = async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(username, password);
      setToken(response.data.access);
      await loadProfile();
      setScreen('home');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (formData) => {
    setLoading(true);
    setError('');
    
    const validation = validateRegistration(formData, false);
    if (!validation.isValid) {
      setError(Object.values(validation.errors)[0]);
      setLoading(false);
      return;
    }

    try {
      await authApi.registerPassenger(formData);
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
    setToken(null);
    setProfile(null);
    setActiveRide(null);
    setRideHistory([]);
    setScreen('auth');
  };

  const handleRequestRide = async (rideData) => {
    setLoading(true);
    setError('');
    
    const validation = validateRideRequest(rideData);
    if (!validation.isValid) {
      setError(Object.values(validation.errors)[0]);
      setLoading(false);
      return;
    }

    try {
      const response = await api.post(API_ENDPOINTS.RIDES, rideData);
      const ride = response.data;
      setActiveRide(ride);
      setScreen('ride');
      Alert.alert('Success', 'Ride requested! Searching for driver...');
    } catch (error) {
      setError(error.message);
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
              setScreen('home');
              await loadRideHistory();
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

  const getUserLocation = async () => {
    const permission = await requestLocationPermission();
    if (!permission.granted) {
      Alert.alert('Permission Required', permission.error);
      return null;
    }

    const location = await getCurrentLocation();
    if (location.success) {
      setCurrentLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });
      return location;
    }
    
    return null;
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

  if (screen === 'home') {
    return <HomeScreen
      profile={profile}
      currentLocation={currentLocation}
      onRequestRide={handleRequestRide}
      onGetLocation={getUserLocation}
      rideHistory={rideHistory}
      onLogout={handleLogout}
      loading={loading}
      error={error}
    />;
  }

  if (screen === 'ride') {
    return <RideScreen
      ride={activeRide}
      currentLocation={currentLocation}
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
        <Text style={styles.title}>Passenger {mode === 'login' ? 'Login' : 'Register'}</Text>
        
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

// Home Screen Component
function HomeScreen({ 
  profile, 
  currentLocation, 
  onRequestRide, 
  onGetLocation,
  rideHistory,
  onLogout,
  loading,
  error 
}) {
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [dropoffLat, setDropoffLat] = useState('');
  const [dropoffLng, setDropoffLng] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const handleUseCurrentLocation = async () => {
    const location = await onGetLocation();
    if (location) {
      setPickupLat(location.latitude.toString());
      setPickupLng(location.longitude.toString());
      Alert.alert('Success', 'Current location set as pickup');
    }
  };

  const handleSubmitRide = () => {
    onRequestRide({
      pickup_location: sanitizeString(pickupLocation),
      dropoff_location: sanitizeString(dropoffLocation),
      pickup_lat: parseFloat(pickupLat),
      pickup_lng: parseFloat(pickupLng),
      dropoff_lat: parseFloat(dropoffLat),
      dropoff_lng: parseFloat(dropoffLng),
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Request a Ride</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome, {profile?.user?.username}</Text>
          <Text style={styles.cardText}>Phone: {profile?.phone_number}</Text>
        </View>
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pickup Location</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter pickup address"
            value={pickupLocation}
            onChangeText={setPickupLocation}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Latitude"
              value={pickupLat}
              onChangeText={setPickupLat}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Longitude"
              value={pickupLng}
              onChangeText={setPickupLng}
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleUseCurrentLocation}
          >
            <Text style={styles.secondaryButtonText}>Use Current Location</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dropoff Location</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter dropoff address"
            value={dropoffLocation}
            onChangeText={setDropoffLocation}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Latitude"
              value={dropoffLat}
              onChangeText={setDropoffLat}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Longitude"
              value={dropoffLng}
              onChangeText={setDropoffLng}
              keyboardType="numeric"
            />
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.button}
          onPress={handleSubmitRide}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Request Ride</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => setShowHistory(!showHistory)}
        >
          <Text style={styles.secondaryButtonText}>
            {showHistory ? 'Hide' : 'Show'} Ride History ({rideHistory.length})
          </Text>
        </TouchableOpacity>
        
        {showHistory && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ride History</Text>
            {rideHistory.length === 0 ? (
              <Text style={styles.cardText}>No rides yet</Text>
            ) : (
              <FlatList
                data={rideHistory}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <Text style={styles.historyText}>Ride #{item.id}</Text>
                    <Text style={styles.historyText}>{item.status}</Text>
                    <Text style={styles.historyText}>{item.pickup_location} → {item.dropoff_location}</Text>
                    {item.fare && <Text style={styles.historyText}>Fare: ${item.fare}</Text>}
                  </View>
                )}
              />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Ride Screen Component
function RideScreen({ ride, currentLocation, onCancel, loading }) {
  if (!ride) return null;

  const pickupCoords = parseCoordinates(ride.pickup_lat, ride.pickup_lng);
  const dropoffCoords = parseCoordinates(ride.dropoff_lat, ride.dropoff_lng);

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
          {ride.driver && (
            <Text style={styles.cardText}>
              Driver: {ride.driver.user?.username || 'Assigned'}
            </Text>
          )}
          {ride.fare && <Text style={styles.cardText}>Fare: ${ride.fare}</Text>}
        </View>
        
        {pickupCoords.latitude !== 0 && (
          <MapView
            style={styles.map}
            region={{
              latitude: (pickupCoords.latitude + dropoffCoords.latitude) / 2,
              longitude: (pickupCoords.longitude + dropoffCoords.longitude) / 2,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker 
              coordinate={pickupCoords}
              title="Pickup"
              pinColor="green"
            />
            <Marker 
              coordinate={dropoffCoords}
              title="Dropoff"
              pinColor="red"
            />
            {currentLocation && (
              <Marker 
                coordinate={currentLocation}
                title="Your Location"
                pinColor="blue"
              />
            )}
          </MapView>
        )}
        
        {!['COMPLETED', 'CANCELLED'].includes(ride.status) && (
          <TouchableOpacity 
            style={[styles.button, styles.cancelButton]} 
            onPress={onCancel}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Cancel Ride</Text>
            )}
          </TouchableOpacity>
        )}
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
  halfInput: { flex: 1, marginHorizontal: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { 
    backgroundColor: '#007AFF', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
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
  map: { height: 300, borderRadius: 8, marginBottom: 15 },
  statusBadge: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: '#007AFF',
    marginBottom: 10,
  },
  historyItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  historyText: { fontSize: 12, color: '#666', marginBottom: 3 },
});

export default function PassengerAppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <PassengerApp />
    </ErrorBoundary>
  );
}
