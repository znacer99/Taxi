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
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { WebSocket } from 'react-native-websocket';

const API_BASE = 'http://127.0.0.1:8000/api';
const WS_BASE = 'ws://127.0.0.1:8000/ws/ride';

// Main App Component
function PassengerApp() {
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(true);

  // Network connectivity monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        setError('Network connection lost. Reconnecting...');
      } else {
        setError('');
      }
    });
    return () => unsubscribe();
  }, []);

  // Load token and profile
  useEffect(() => {
    if (token) {
      loadProfile();
      checkActiveRide();
      loadRideHistory();
    }
  }, [token]);

  // Location tracking
  useEffect(() => {
    let locationSubscription;
    
    const startLocationTracking = async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission denied');
          return;
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
          },
          (position) => {
            setCurrentLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          }
        );
      } catch (err) {
        console.error('Location error:', err);
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    if (!isConnected) {
      throw new Error('No network connection');
    }

    const storedToken = token; // In real app, get from AsyncStorage
    const headers = { 'Content-Type': 'application/json' };
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid JSON response');
      }
      
      if (response.status === 401) {
        setToken(null);
        setScreen('auth');
        throw new Error('Session expired. Please login again.');
      }

      if (!response.ok) { 
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error.message.includes('Network')) {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  };

  const handleAuth = async (formData) => {
    setLoading(true);
    setError('');
    try {
      if (authMode === 'login') {
        const data = await apiCall('/token/', 'POST', {
          username: formData.username,
          password: formData.password
        });
        // await AsyncStorage.setItem('passenger_token', data.access);
        setToken(data.access);
        await loadProfile();
        setScreen('home');
        setSuccess('Login successful!');
      } else {
        await apiCall('/register/passenger/', 'POST', formData);
        setSuccess('Registration successful! Please login.');
        setAuthMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    const storedToken = token;
    if (!storedToken) {
      setScreen('auth');
      return;
    }

    try {
      const data = await apiCall('/passengers/me/');
      const profileData = data.data || data;
      setProfile(profileData);
      setUser(profileData.user);
    } catch (err) {
      console.error('Profile load error:', err);
    }
  };

  const checkActiveRide = async () => {
    try {
      const data = await apiCall('/rides/');
      const ridesArray = Array.isArray(data) ? data : (data.data || []);
      const active = ridesArray.find(r =>
        !['completed', 'cancelled'].includes(r.status.toLowerCase())
      );
      if (active) setActiveRide(active);
    } catch (err) {
      console.error('Check ride error:', err);
    }
  };

  const loadRideHistory = async () => {
    try {
      const data = await apiCall('/rides/');
      const ridesArray = Array.isArray(data) ? data : (data.data || []);
      setRideHistory(ridesArray);
    } catch (err) {
      console.error('History load error:', err);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setProfile(null);
    setActiveRide(null);
    setScreen('auth');
  };

  if (screen === 'auth') {
    return (
      <AuthScreen 
        mode={authMode} 
        setMode={setAuthMode}
        onSubmit={handleAuth}
        loading={loading}
        error={error}
        success={success}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header user={user} onLogout={logout} />
      <ScrollView style={styles.scrollView}>
        {screen === 'home' && (
          <HomeScreen 
            currentLocation={currentLocation}
            activeRide={activeRide}
            onNavigate={setScreen}
          />
        )}
        {screen === 'request' && (
          <RequestRideScreen 
            currentLocation={currentLocation}
            token={token}
            apiCall={apiCall}
            onSuccess={(ride) => {
              setActiveRide(ride);
              setScreen('ride');
            }}
          />
        )}
        {screen === 'ride' && (
          <ActiveRideScreen 
            ride={activeRide}
            token={token}
            apiCall={apiCall}
            onUpdate={(data) => setActiveRide(prev => ({ ...prev, ...data }))}
            onComplete={() => {
              setActiveRide(null);
              loadRideHistory();
              setScreen('home');
            }}
          />
        )}
        {screen === 'history' && (
          <RideHistoryScreen rides={rideHistory} />
        )}
        {screen === 'profile' && (
          <ProfileScreen 
            profile={profile}
            token={token}
            apiCall={apiCall}
            onUpdate={setProfile}
          />
        )}
      </ScrollView>
      <BottomNav screen={screen} setScreen={setScreen} />
    </SafeAreaView>
  );
}

// Auth Screen
function AuthScreen({ mode, setMode, onSubmit, loading, error, success }) {
  const [formData, setFormData] = useState({
    username: '', email: '', password: '', phone_number: ''
  });

  const handleSubmit = () => {
    onSubmit(formData);
  };

  return (
    <ScrollView contentContainerStyle={styles.authContainer}>
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>🚗 RukoGo</Text>
        
        <View style={styles.authModeToggle}>
          <TouchableOpacity 
            style={[styles.authModeButton, mode === 'login' && styles.authModeButtonActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.authModeText, mode === 'login' && styles.authModeTextActive]}>
              Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.authModeButton, mode === 'register' && styles.authModeButtonActive]}
            onPress={() => setMode('register')}
          >
            <Text style={[styles.authModeText, mode === 'register' && styles.authModeTextActive]}>
              Register
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <View style={styles.authForm}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={formData.username}
            onChangeText={(text) => setFormData({...formData, username: text})}
          />
          
          {mode === 'register' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={formData.email}
                onChangeText={(text) => setFormData({...formData, email: text})}
                keyboardType="email-address"
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
          
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={formData.password}
            onChangeText={(text) => setFormData({...formData, password: text})}
            secureTextEntry
          />
          
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'login' ? 'Login' : 'Register'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// Header Component
function Header({ user, onLogout }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>🚗 RideShare</Text>
      <View style={styles.headerRight}>
        <Text style={styles.headerText}>Hi, {user?.username || 'Passenger'}</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Home Screen
function HomeScreen({ currentLocation, activeRide, onNavigate }) {
  return (
    <View style={styles.homeContainer}>
      {activeRide && (
        <View style={[styles.card, styles.activeRideCard]}>
          <View style={styles.activeRideContent}>
            <View>
              <Text style={styles.activeRideTitle}>Active Ride</Text>
              <Text style={styles.activeRideStatus}>Status: {activeRide.status}</Text>
            </View>
            <TouchableOpacity 
              style={styles.viewRideButton}
              onPress={() => onNavigate('ride')}
            >
              <Text style={styles.viewRideButtonText}>View Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Location</Text>
        {currentLocation ? (
          <>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: currentLocation.lat,
                longitude: currentLocation.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: currentLocation.lat,
                  longitude: currentLocation.lng,
                }}
                title="You are here"
              />
            </MapView>
            <Text style={styles.locationText}>
              📍 {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            </Text>
          </>
        ) : (
          <Text style={styles.loadingText}>Getting your location...</Text>
        )}
      </View>

      <TouchableOpacity 
        style={[
          styles.primaryButton,
          (!currentLocation || activeRide) && styles.buttonDisabled
        ]}
        onPress={() => onNavigate('request')}
        disabled={!currentLocation || activeRide}
      >
        <Text style={styles.primaryButtonText}>
          {activeRide ? 'Ride in Progress' : '🚗 Request a Ride'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Request Ride Screen
function RequestRideScreen({ currentLocation, token, apiCall, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    pickup_location: '',
    pickup_lat: '',
    pickup_lng: '',
    dropoff_location: '',
    dropoff_lat: '',
    dropoff_lng: ''
  });

  useEffect(() => {
    if (currentLocation) {
      setFormData(prev => ({
        ...prev,
        pickup_location: `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`,
        pickup_lat: currentLocation.lat.toString(),
        pickup_lng: currentLocation.lng.toString()
      }));
    }
  }, [currentLocation]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const accessToken = token; // In real app, get from AsyncStorage
      if (!accessToken) throw new Error('You must be logged in to request a ride.');

      const data = await apiCall('/rides/', 'POST', {
        pickup_location: formData.pickup_location,
        pickup_lat: parseFloat(formData.pickup_lat) || 0,
        pickup_lng: parseFloat(formData.pickup_lng) || 0,
        dropoff_location: formData.dropoff_location,
        dropoff_lat: parseFloat(formData.dropoff_lat) || 0,
        dropoff_lng: parseFloat(formData.dropoff_lng) || 0
      });

      if (!data.success) throw new Error(data.message || 'Ride request failed'); 
      
      onSuccess(data.data);
    } catch (err) {
      console.error('Request ride error:', err);
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.requestContainer}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Request a Ride</Text>
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.requestForm}>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Pickup Location</Text>
            <TextInput
              style={styles.input}
              value={formData.pickup_location}
              onChangeText={(text) => setFormData({...formData, pickup_location: text})}
            />
            <View style={styles.coordinatesRow}>
              <TextInput
                style={[styles.input, styles.coordinateInput]}
                placeholder="Latitude"
                value={formData.pickup_lat}
                onChangeText={(text) => setFormData({...formData, pickup_lat: text})}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.coordinateInput]}
                placeholder="Longitude"
                value={formData.pickup_lng}
                onChangeText={(text) => setFormData({...formData, pickup_lng: text})}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Dropoff Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter destination"
              value={formData.dropoff_location}
              onChangeText={(text) => setFormData({...formData, dropoff_location: text})}
            />
            <View style={styles.coordinatesRow}>
              <TextInput
                style={[styles.input, styles.coordinateInput]}
                placeholder="Latitude"
                value={formData.dropoff_lat}
                onChangeText={(text) => setFormData({...formData, dropoff_lat: text})}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.coordinateInput]}
                placeholder="Longitude"
                value={formData.dropoff_lng}
                onChangeText={(text) => setFormData({...formData, dropoff_lng: text})}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'Requesting...' : 'Request Ride'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Active Ride Screen
function ActiveRideScreen({ ride, token, apiCall, onUpdate, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rideDetails, setRideDetails] = useState(ride);
  const wsRef = useRef(null);

  useEffect(() => {
    const fetchRideDetails = async () => {
      if (ride && ride.id) {
        try {
          const storedToken = token; // In real app, get from AsyncStorage
          if (!storedToken) throw new Error("Missing token");

          const data = await apiCall(`/rides/${ride.id}/`, "GET", null, storedToken);
          setRideDetails(data.data || data);
        } catch (err) {
          console.error("Fetch ride error:", err);
          setRideDetails(ride);

          if (err.message?.includes("Session expired") || err.status === 401) {
            Alert.alert("Session expired. Please log in again.");
            // await AsyncStorage.removeItem('passenger_token');
            // setScreen("auth");
          }
        }
      }
    };
    fetchRideDetails();
  }, [ride?.id, token]);

  // Parse coordinates for map
  const getCoordinates = () => {
    if (!rideDetails) return null;

    const parseCoords = (str) => {
      if (!str) return null;
      const match = str.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
      if (!match) return null;
      return {
        latitude: parseFloat(match[1]),
        longitude: parseFloat(match[2])
      };
    };

    const pickup = parseCoords(rideDetails.pickup_location);
    const dropoff = parseCoords(rideDetails.dropoff_location);

    return { pickup, dropoff };
  };

  const coordinates = getCoordinates();

  // WebSocket connection
  useEffect(() => {
    if (!rideDetails?.id) return;

    const wsToken = token; // In real app, get from AsyncStorage
    const ws = new WebSocket(`${WS_BASE}/${rideDetails.id}/?token=${wsToken}`);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const rideData = data.ride || data;

      setRideDetails(prev => ({ ...prev, ...rideData }));
      onUpdate(rideData);
      
      if (['completed', 'cancelled'].includes(rideData.status)) {
        setTimeout(() => {
          onComplete();
        }, 2000);
      }
    };

    ws.onerror = (err) => console.error('WebSocket error:', err);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [rideDetails?.id, token]);

  const cancelRide = async () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes', 
          onPress: async () => {
            setLoading(true);
            setError('');
            try {
              await apiCall(`/rides/${rideDetails.id}/cancel_ride/`, 'POST');
              onComplete();
            } catch (err) {
              setError(err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  if (!rideDetails) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading ride details...</Text>
      </View>
    );
  }

  const statusText = {
    'requested': 'Waiting for driver...',
    'assigned': 'Driver assigned!',
    'accepted': 'Driver is on the way',
    'in_progress': 'Ride in progress',
    'completed': 'Ride completed',
    'cancelled': 'Ride cancelled'
  };

  const getStatusStyle = (status) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'requested') return styles.statusRequested;
    if (statusLower === 'assigned') return styles.statusAssigned;
    if (statusLower === 'accepted') return styles.statusAccepted;
    if (statusLower === 'in_progress') return styles.statusInProgress;
    if (statusLower === 'completed') return styles.statusCompleted;
    if (statusLower === 'cancelled') return styles.statusCancelled;
    return styles.statusDefault;
  };

  return (
    <ScrollView style={styles.rideContainer}>
      <View style={styles.card}>
        <View style={styles.rideHeader}>
          <View>
            <Text style={styles.rideTitle}>Active Ride</Text>
            <Text style={[styles.statusBadge, getStatusStyle(rideDetails.status)]}>
              {statusText[rideDetails.status.toLowerCase()] || rideDetails.status}
            </Text>
          </View>
          <Text style={styles.rideId}>Ride #{rideDetails.id}</Text>
        </View>

        {coordinates && coordinates.pickup && coordinates.dropoff && (
          <MapView
            style={styles.map}
            region={{
              latitude: coordinates.pickup.latitude,
              longitude: coordinates.pickup.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker coordinate={coordinates.pickup} title="Pickup" pinColor="green" />
            <Marker coordinate={coordinates.dropoff} title="Dropoff" pinColor="red" />
            <Polyline
              coordinates={[coordinates.pickup, coordinates.dropoff]}
              strokeColor="#000"
              strokeWidth={3}
            />
          </MapView>
        )}

        <View style={styles.locationDetails}>
          <View style={styles.locationItem}>
            <Text style={styles.locationIcon}>🟢</Text>
            <View>
              <Text style={styles.locationLabel}>Pickup</Text>
              <Text style={styles.locationAddress}>{rideDetails.pickup_location}</Text>
            </View>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationIcon}>🔴</Text>
            <View>
              <Text style={styles.locationLabel}>Dropoff</Text>
              <Text style={styles.locationAddress}>{rideDetails.dropoff_location}</Text>
            </View>
          </View>
        </View>

        {rideDetails.driver && (
          <View style={styles.driverDetails}>
            <Text style={styles.driverTitle}>Driver Details</Text>
            <Text style={styles.driverInfo}>
              <Text style={styles.driverLabel}>Name: </Text>
              {rideDetails.driver.user.username}
            </Text>
            <Text style={styles.driverInfo}>
              <Text style={styles.driverLabel}>Car: </Text>
              {rideDetails.driver.car_model}
            </Text>
            <Text style={styles.driverInfo}>
              <Text style={styles.driverLabel}>Plate: </Text>
              {rideDetails.driver.car_plate}
            </Text>
          </View>
        )}

        {rideDetails.fare && (
          <View style={styles.fareContainer}>
            <Text style={styles.fareText}>Fare: ${rideDetails.fare}</Text>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!['completed', 'cancelled'].includes(rideDetails.status.toLowerCase()) && (
          <TouchableOpacity 
            style={styles.dangerButton}
            onPress={cancelRide}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Cancelling...' : 'Cancel Ride'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// Ride History Screen
function RideHistoryScreen({ rides }) {
  return (
    <View style={styles.historyContainer}>
      <Text style={styles.historyTitle}>Ride History</Text>
      {rides.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.placeholderText}>No rides yet</Text>
        </View>
      ) : (
        <View style={styles.ridesList}>
          {rides.map(ride => (
            <View key={ride.id} style={styles.rideCard}>
              <View style={styles.rideCardContent}>
                <View style={styles.rideInfo}>
                  <Text style={styles.rideRoute}>
                    {ride.pickup_location} → {ride.dropoff_location}
                  </Text>
                  <Text style={styles.rideDate}>
                    {new Date(ride.requested_at).toLocaleDateString()}
                  </Text>
                  <Text style={[styles.statusBadge, styles[`status${ride.status.charAt(0).toUpperCase() + ride.status.slice(1).toLowerCase()}`]]}>
                    {ride.status}
                  </Text>
                </View>
                {ride.fare && (
                  <View style={styles.rideFare}>
                    <Text style={styles.fareAmount}>${ride.fare}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Profile Screen
function ProfileScreen({ profile, token, apiCall, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiCall('/passengers/me/', 'PUT', { phone_number: phoneNumber });
      onUpdate(data.data);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.profileContainer}>
      <View style={styles.card}>
        <Text style={styles.profileTitle}>Profile</Text>
        
        <View style={styles.profileInfo}>
          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>Username</Text>
            <Text style={styles.profileValue}>{profile.user.username}</Text>
          </View>
          
          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>Email</Text>
            <Text style={styles.profileValue}>{profile.user.email}</Text>
          </View>
          
          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>Phone Number</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.profileValue}>{profile.phone_number}</Text>
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {editing ? (
            <View style={styles.editActions}>
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={handleSave}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => {
                  setEditing(false);
                  setPhoneNumber(profile.phone_number);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => setEditing(true)}
            >
              <Text style={styles.primaryButtonText}>Edit Phone Number</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// Bottom Navigation
function BottomNav({ screen, setScreen }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'history', label: 'History', icon: '📋' },
    { id: 'profile', label: 'Profile', icon: '👤' }
  ];

  return (
    <View style={styles.bottomNav}>
      {navItems.map(item => (
        <TouchableOpacity
          key={item.id}
          style={styles.navItem}
          onPress={() => setScreen(item.id)}
        >
          <Text style={[
            styles.navIcon,
            screen === item.id && styles.navIconActive
          ]}>
            {item.icon}
          </Text>
          <Text style={[
            styles.navLabel,
            screen === item.id && styles.navLabelActive
          ]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  // Auth Styles
  authContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  authCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#2563eb',
    marginBottom: 24,
  },
  authModeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  authModeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  authModeButtonActive: {
    backgroundColor: '#2563eb',
  },
  authModeText: {
    textAlign: 'center',
    fontWeight: '600',
    color: '#6b7280',
  },
  authModeTextActive: {
    color: 'white',
  },
  authForm: {
    gap: 16,
  },
  // Input Styles
  input: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  // Button Styles
  primaryButton: {
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#6b7280',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#dc2626',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  // Header Styles
  header: {
    backgroundColor: '#2563eb',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerText: {
    color: 'white',
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  // Card Styles
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  // Home Styles
  homeContainer: {
    padding: 16,
  },
  activeRideCard: {
    backgroundColor: '#dbeafe',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  activeRideContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeRideTitle: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  activeRideStatus: {
    fontSize: 14,
    color: '#6b7280',
  },
  viewRideButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewRideButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  // Map Styles
  map: {
    height: 300,
    borderRadius: 8,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#6b7280',
  },
  // Request Ride Styles
  requestContainer: {
    padding: 16,
  },
  requestForm: {
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  coordinateInput: {
    flex: 1,
  },
  // Ride Screen Styles
  rideContainer: {
    padding: 16,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rideTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  rideId: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontWeight: '600',
    marginTop: 8,
    fontSize: 12,
  },
  statusRequested: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  statusAssigned: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  statusAccepted: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  statusInProgress: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
  },
  statusCompleted: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusCancelled: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  statusDefault: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  locationDetails: {
    marginTop: 16,
    gap: 12,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  locationIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  locationLabel: {
    fontWeight: '600',
    fontSize: 16,
  },
  locationAddress: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  driverDetails: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  driverTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  driverInfo: {
    fontSize: 14,
    marginBottom: 4,
  },
  driverLabel: {
    fontWeight: '600',
  },
  fareContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
  },
  fareText: {
    fontWeight: 'bold',
    fontSize: 20,
    color: '#166534',
  },
  // History Styles
  historyContainer: {
    padding: 16,
  },
  historyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  ridesList: {
    gap: 12,
  },
  rideCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  rideCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rideInfo: {
    flex: 1,
  },
  rideRoute: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 4,
  },
  rideDate: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  rideFare: {
    alignItems: 'flex-end',
  },
  fareAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
  },
  // Profile Styles
  profileContainer: {
    padding: 16,
  },
  profileTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  profileInfo: {
    gap: 16,
  },
  profileField: {
    gap: 4,
  },
  profileLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  profileValue: {
    fontSize: 16,
  },
  editActions: {
    gap: 8,
  },
  // Bottom Nav Styles
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingVertical: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  navIconActive: {
    color: '#2563eb',
  },
  navLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  navLabelActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  // Utility Styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    color: '#6b7280',
    textAlign: 'center',
  },
  errorText: {
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  successText: {
    color: '#166534',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  placeholderText: {
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 32,
  },
});

export default PassengerApp;