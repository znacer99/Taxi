import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
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

// Main Driver App Component
function DriverApp() {
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const locationIntervalRef = useRef(null);
  const wsRef = useRef(null);

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

  // Load token on mount
  useEffect(() => {
    // In React Native, you would use AsyncStorage instead of localStorage
    // For now, we'll simulate token loading
    const loadToken = async () => {
      // const storedToken = await AsyncStorage.getItem('access_token');
      // if (storedToken) {
      //   setToken(storedToken);
      //   setScreen('home');
      //   loadProfile(storedToken);
      // }
    };
    loadToken();
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!profile?.id || !isAvailable || !isConnected) return;
    
    const driverId = profile.id;
    const storedToken = token; // In real app, get from AsyncStorage
    
    if (!storedToken) return;
    
    const wsUrl = `ws://127.0.0.1:8000/ws/driver/${driverId}/?token=${storedToken}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => console.log("WebSocket connected for driver:", driverId);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Driver WS received:', data);

      if (data.type === "ride_update" && data.ride) {
        const status = data.ride.status.toLowerCase();
        if (status && !['completed', 'cancelled'].includes(status)) {
          setActiveRide(data.ride);
        } else {
          setActiveRide(null);
          loadEarnings();
        }
      }
    };
    
    ws.onclose = () => {
      console.warn("⚠️ WebSocket closed, retrying...");
      wsRef.current = null;
      setTimeout(() => {
        if (isAvailable && isConnected) {
          const newWs = new WebSocket(wsUrl);
          wsRef.current = newWs;
        }
      }, 3000);
    };
    
    ws.onerror = (err) => console.error("WebSocket error:", err);
    
    return () => { 
      if (wsRef.current) {
        wsRef.current.close(); 
        wsRef.current = null; 
      }
    };
  }, [isAvailable, profile?.id, isConnected]);

  // Screen management based on active ride
  useEffect(() => {
    if (activeRide && screen !== 'ride') {
      setScreen('ride');
    } else if (!activeRide && screen === 'ride') {
      setScreen('dashboard');
    }
  }, [activeRide, screen]);

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
            timeInterval: 5000,
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

  // Location updates to backend
  useEffect(() => {
    const storedToken = token; // In real app, get from AsyncStorage
    if (!storedToken) return;

    if (isAvailable && currentLocation) {
      const updateLocationInterval = () => updateLocation(storedToken);
      
      updateLocationInterval();
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = setInterval(updateLocationInterval, 10000);
    } else {
      clearInterval(locationIntervalRef.current);
    }

    return () => clearInterval(locationIntervalRef.current);
  }, [isAvailable, currentLocation, token]);

  const apiCall = async (endpoint, method = 'GET', body = null, authtoken = null) => {
    if (!isConnected) {
      throw new Error('No network connection');
    }

    const storedToken = authtoken || token;
    const headers = { 'Content-Type': 'application/json' };
    if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      const data = await response.json();
      
      if (response.status === 401) {
        setToken(null);
        // await AsyncStorage.removeItem('access_token');
        setScreen('auth');
        throw new Error('Session expired. Please login again.');
      }
      
      if (!response.ok && !data.success) {
        throw new Error(data.message || 'Request failed');
      }
      
      return data;
    } catch (error) {
      if (error.message.includes('Network')) {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  };

  const updateLocation = async (authtoken) => {
    const currentToken = authtoken || token;
    if (!currentLocation || !currentToken) return;
    
    try {
      await apiCall('/rides/update_location/', 'POST', {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        is_available: isAvailable
      });
    } catch (err) {
      console.error('Location update error:', err);
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
        // await AsyncStorage.setItem('access_token', data.access);
        setToken(data.access);
        await loadProfile();
        setScreen('dashboard');
        setSuccess('Login successful!');
      } else {
        await apiCall('/register/driver/', 'POST', formData);
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
    try {
      const data = await apiCall('/drivers/me/');
      setProfile(data.data || data);
      setUser(data.data.user);
      setIsAvailable(data.data.is_available || false);
    } catch (err) {
      console.error('Profile load error:', err);
    }
  };

  const checkActiveRide = async () => {
    try {
      const data = await apiCall('/rides/');
      const rides = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
      const active = rides.find(r => 
        !['completed', 'cancelled'].includes(r.status.toLowerCase())
      );
      if (active) {
        setActiveRide(active);
      }
    } catch (err) {
      console.error('Check ride error:', err);
    }
  };

  // Poll active ride
  useEffect(() => {
    if (!activeRide?.id || !token) return;

    const pollRide = setInterval(async () => {
      try {
        const data = await apiCall(`/rides/${activeRide.id}/`);
        const ride = data.data || data;
        setActiveRide(ride);

        if (['completed', 'cancelled'].includes(ride.status.toLowerCase())) {
          setActiveRide(null);
          loadEarnings();
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);

    return () => clearInterval(pollRide);
  }, [activeRide?.id, token]);

  const loadEarnings = async () => {
    try {
      const data = await apiCall('/rides/earnings/');
      setEarnings(data.data);
    } catch (err) {
      console.error('Earnings load error:', err);
    }
  };

  useEffect(() => {
    if (token && profile) {
      checkActiveRide();
      loadEarnings();
    }
  }, [token, profile]);

  const toggleAvailability = async () => {
    const newAvailability = !isAvailable;
    setIsAvailable(newAvailability);
    
    if (currentLocation) {
      try {
        await apiCall('/rides/update_location/', 'POST', {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
          is_available: newAvailability
        });
      } catch (err) {
        console.error('Availability update error:', err);
      }
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setProfile(null);
    setActiveRide(null);
    setIsAvailable(false);
    setScreen('auth');
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
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
        {screen === 'dashboard' && (
          <DashboardScreen 
            currentLocation={currentLocation}
            isAvailable={isAvailable}
            onToggleAvailability={toggleAvailability}
            activeRide={activeRide}
            onNavigate={setScreen}
            onUpdateLocation={updateLocation}
          />
        )}
        {screen === 'ride' && (
          <AssignedRideScreen 
            ride={activeRide}
            token={token}
            apiCall={apiCall}
            onUpdate={setActiveRide}
            onComplete={() => {
              setActiveRide(null);
              loadEarnings();
              setScreen('dashboard');
            }}
            currentLocation={currentLocation}
          />
        )}
        {screen === 'earnings' && (
          <EarningsScreen earnings={earnings} />
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
    username: '', email: '', password: '', car_model: '', car_plate: ''
  });

  const handleSubmit = () => {
    onSubmit(formData);
  };

  return (
    <ScrollView contentContainerStyle={styles.authContainer}>
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>🚗 RukoGo Driver</Text>
        
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
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={formData.email}
              onChangeText={(text) => setFormData({...formData, email: text})}
              keyboardType="email-address"
            />
          )}
          
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
                placeholder="Car Model (e.g., Toyota Camry)"
                value={formData.car_model}
                onChangeText={(text) => setFormData({...formData, car_model: text})}
              />
              <TextInput
                style={styles.input}
                placeholder="Car Plate (e.g., ABC123)"
                value={formData.car_plate}
                onChangeText={(text) => setFormData({...formData, car_plate: text})}
              />
            </>
          )}
          
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
      <Text style={styles.headerTitle}>🚗 RukoGo Driver</Text>
      <View style={styles.headerRight}>
        <Text style={styles.headerText}>Hi, {user?.username || 'Driver'}</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Dashboard Screen
function DashboardScreen({ currentLocation, isAvailable, onToggleAvailability, activeRide, onNavigate, onUpdateLocation }) {
  const getStatusText = () => {
    return isAvailable ? 'Available - Waiting for rides' : 'Offline - Not accepting rides';
  };

  return (
    <View style={styles.dashboardContainer}>
      {activeRide && (
        <View style={[styles.card, styles.activeRideCard]}>
          <View style={styles.activeRideContent}>
            <View>
              <Text style={styles.activeRideTitle}>Active Ride</Text>
              <Text style={styles.activeRideStatus}>Ready to accept</Text>
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
        <Text style={styles.cardTitle}>Driver Status</Text>
        <TouchableOpacity 
          style={[
            styles.availabilityToggle,
            isAvailable ? styles.availabilityOnline : styles.availabilityOffline
          ]}
          onPress={onToggleAvailability}
        >
          <Text style={styles.availabilityText}>
            {isAvailable ? '🟢 AVAILABLE' : '⚫ OFFLINE'}
          </Text>
          <Text style={styles.availabilitySubtext}>
            {isAvailable ? 'Tap to go offline' : 'Tap to go online'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.statusText}>{getStatusText()}</Text>
      </View>

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
                title="Your location"
              />
            </MapView>
            <View style={styles.locationInfo}>
              <Text style={styles.locationText}>
                📍 {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
              </Text>
              <TouchableOpacity 
                style={styles.updateLocationButton}
                onPress={onUpdateLocation}
              >
                <Text style={styles.updateLocationButtonText}>Update Location</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.loadingText}>Getting your location...</Text>
        )}
      </View>

      {!activeRide && isAvailable && (
        <View style={[styles.card, styles.availableCard]}>
          <Text style={styles.availableTitle}>You're online and ready to accept rides!</Text>
          <Text style={styles.availableSubtitle}>Rides will be automatically assigned to you</Text>
        </View>
      )}
    </View>
  );
}

// Assigned Ride Screen
function AssignedRideScreen({ ride, token, apiCall, onUpdate, onComplete, currentLocation }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rideDetails, setRideDetails] = useState(ride);
  const wsRef = useRef(null);

  useEffect(() => {
    const fetchRideDetails = async () => {
      if (!ride?.id) return;
      try {
        const data = await apiCall(`/rides/${ride.id}/`);
        setRideDetails(data.data || data);
      } catch (err) {
        console.error('Fetch ride error:', err);
        setRideDetails(ride);
      }
    };
    fetchRideDetails();
  }, [ride?.id]);

  // Parse coordinates from location strings
  const parseCoords = (str, fallbackLat, fallbackLng) => {
    if (!str) return [fallbackLat, fallbackLng];
    const match = str.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
    if (!match) return [fallbackLat, fallbackLng];
    return [parseFloat(match[1]), parseFloat(match[2])];
  };

  const getCoordinates = () => {
    if (!rideDetails || !currentLocation) return null;

    const [pickupLat, pickupLng] = parseCoords(
      rideDetails.pickup_location,
      rideDetails.pickup_lat || currentLocation.lat,
      rideDetails.pickup_lng || currentLocation.lng
    );
    const [dropoffLat, dropoffLng] = parseCoords(
      rideDetails.dropoff_location,
      rideDetails.dropoff_lat || currentLocation.lat + 0.01,
      rideDetails.dropoff_lng || currentLocation.lng + 0.01
    );

    return {
      pickup: { latitude: pickupLat, longitude: pickupLng },
      dropoff: { latitude: dropoffLat, longitude: dropoffLng },
      current: { latitude: currentLocation.lat, longitude: currentLocation.lng }
    };
  };

  const coordinates = getCoordinates();

  // WebSocket for real-time updates
  useEffect(() => {
    if (!rideDetails?.id) return;

    const storedToken = token; // In real app, get from AsyncStorage
    let reconnectTimer;
    
    const connectWS = () => {
      const ws = new WebSocket(`${WS_BASE}/${rideDetails.id}/?token=${storedToken}`);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setRideDetails(prev => ({ ...prev, ...data }));
        onUpdate(data);
      
        if (['completed', 'cancelled'].includes(data.status?.toLowerCase())) {
          onComplete();
        }
      };
    
      ws.onerror = (err) => console.error('WebSocket error:', err);
    
      ws.onclose = () => {
        console.log('WS closed, reconnecting...');
        reconnectTimer = setTimeout(connectWS, 3000);
      };

      wsRef.current = ws;
    };

    connectWS();
    
    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [rideDetails?.id]);

  const handleAction = async (url) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiCall(url, 'POST');
      setRideDetails(data.data || data);
      onUpdate(data.data || data);
      if (url.includes('complete_ride')) setTimeout(onComplete, 1000);
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };
  
  const acceptRide = () => handleAction(`/rides/${rideDetails.id}/accept_ride/`);
  const startRide = () => handleAction(`/rides/${rideDetails.id}/start_ride/`);
  const completeRide = () => handleAction(`/rides/${rideDetails.id}/complete_ride/`);
  const cancelRide = () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => handleAction(`/rides/${rideDetails.id}/cancel_ride/`) }
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
    'assigned': 'Ride Assigned',
    'accepted': 'Ride Accepted',
    'in_progress': 'Ride in Progress',
    'completed': 'Ride Completed',
    'cancelled': 'Ride Cancelled'
  };

  const getStatusStyle = (status) => {
    const statusLower = status.toLowerCase();
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
        
        {coordinates && (
          <MapView
            style={styles.map}
            region={{
              latitude: coordinates.current.latitude,
              longitude: coordinates.current.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker coordinate={coordinates.current} title="Your location" pinColor="blue" />
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
              <Text style={styles.locationLabel}>Pickup Location</Text>
              <Text style={styles.locationAddress}>{rideDetails.pickup_location}</Text>
            </View>
          </View>
          <View style={styles.locationItem}>
            <Text style={styles.locationIcon}>🔴</Text>
            <View>
              <Text style={styles.locationLabel}>Dropoff Location</Text>
              <Text style={styles.locationAddress}>{rideDetails.dropoff_location}</Text>
            </View>
          </View>
        </View>
        
        {rideDetails.passenger && (
          <View style={styles.passengerDetails}>
            <Text style={styles.passengerTitle}>Passenger Details</Text>
            <Text style={styles.passengerInfo}>
              <Text style={styles.passengerLabel}>Name: </Text>
              {rideDetails.passenger.user.username}
            </Text>
            <Text style={styles.passengerInfo}>
              <Text style={styles.passengerLabel}>Phone: </Text>
              {rideDetails.passenger.phone_number || 'Not provided'}
            </Text>
          </View>
        )}
        
        {rideDetails.fare && (
          <View style={styles.fareContainer}>
            <Text style={styles.fareText}>Fare: ${rideDetails.fare}</Text>
          </View>
        )}
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        
        <View style={styles.rideActions}>
          {rideDetails.status === 'assigned' && (
            <TouchableOpacity 
              style={styles.successButton}
              onPress={acceptRide}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Accepting...' : '✅ Accept Ride'}
              </Text>
            </TouchableOpacity>
          )}
          {rideDetails.status === 'accepted' && (
            <TouchableOpacity 
              style={styles.warningButton}
              onPress={startRide}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Starting...' : '🚀 Start Ride'}
              </Text>
            </TouchableOpacity>
          )}
          {rideDetails.status === 'in_progress' && (
            <TouchableOpacity 
              style={styles.successButton}
              onPress={completeRide}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Completing...' : '✅ Complete Ride'}
              </Text>
            </TouchableOpacity>
          )}
          {!['completed', 'cancelled'].includes(rideDetails.status) && (
            <TouchableOpacity 
              style={styles.dangerButton}
              onPress={cancelRide}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Cancelling...' : '❌ Cancel Ride'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// Earnings Screen
function EarningsScreen({ earnings }) {
  if (!earnings) {
    return (
      <View style={styles.earningsContainer}>
        <Text style={styles.earningsTitle}>Earnings</Text>
        <View style={styles.card}>
          <Text style={styles.loadingText}>Loading earnings...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.earningsContainer}>
      <Text style={styles.earningsTitle}>Earnings Summary</Text>
      
      <View style={styles.earningsGrid}>
        <View style={[styles.earningsCard, styles.totalEarnings]}>
          <Text style={styles.earningsAmount}>${earnings.total_earnings || 0}</Text>
          <Text style={styles.earningsLabel}>Total Earnings</Text>
        </View>
        
        <View style={[styles.earningsCard, styles.totalRides]}>
          <Text style={styles.earningsAmount}>{earnings.total_rides || 0}</Text>
          <Text style={styles.earningsLabel}>Total Rides</Text>
        </View>
        
        <View style={[styles.earningsCard, styles.averageEarnings]}>
          <Text style={styles.earningsAmount}>${earnings.average_per_ride || 0}</Text>
          <Text style={styles.earningsLabel}>Average per Ride</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Activity</Text>
        <Text style={styles.placeholderText}>
          Detailed ride history and earnings breakdown would appear here.
        </Text>
      </View>
    </View>
  );
}

// Profile Screen
function ProfileScreen({ profile, token, apiCall, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    car_model: '',
    car_plate: ''
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        car_model: profile.car_model || '',
        car_plate: profile.car_plate || ''
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiCall('/drivers/me/', 'PUT', formData);
      onUpdate(data.data || data);
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
        <Text style={styles.profileTitle}>Driver Profile</Text>
        
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
            <Text style={styles.profileLabel}>Car Model</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.car_model}
                onChangeText={(text) => setFormData({...formData, car_model: text})}
                placeholder="Enter car model"
              />
            ) : (
              <Text style={styles.profileValue}>{profile.car_model}</Text>
            )}
          </View>

          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>Car Plate</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.car_plate}
                onChangeText={(text) => setFormData({...formData, car_plate: text})}
                placeholder="Enter car plate"
              />
            ) : (
              <Text style={styles.profileValue}>{profile.car_plate}</Text>
            )}
          </View>

          <View style={styles.profileField}>
            <Text style={styles.profileLabel}>Availability Status</Text>
            <Text style={[
              styles.profileValue,
              profile.is_available ? styles.availableText : styles.offlineText
            ]}>
              {profile.is_available ? '🟢 Available' : '⚫ Offline'}
            </Text>
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
                  {loading ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => {
                  setEditing(false);
                  setFormData({
                    car_model: profile.car_model,
                    car_plate: profile.car_plate
                  });
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
              <Text style={styles.primaryButtonText}>Edit Car Details</Text>
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
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'earnings', label: 'Earnings', icon: '💰' },
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
  successButton: {
    backgroundColor: '#059669',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  warningButton: {
    backgroundColor: '#d97706',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
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
  // Dashboard Styles
  dashboardContainer: {
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
  // Availability Toggle
  availabilityToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  availabilityOnline: {
    backgroundColor: '#dcfce7',
  },
  availabilityOffline: {
    backgroundColor: '#f3f4f6',
  },
  availabilityText: {
    fontWeight: '600',
    fontSize: 16,
  },
  availabilitySubtext: {
    fontSize: 14,
  },
  statusText: {
    fontSize: 14,
    color: '#6b7280',
  },
  // Map Styles
  map: {
    height: 300,
    borderRadius: 8,
    marginBottom: 8,
  },
  locationInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#6b7280',
  },
  updateLocationButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  updateLocationButtonText: {
    color: 'white',
    fontSize: 14,
  },
  availableCard: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
    borderWidth: 1,
  },
  availableTitle: {
    fontWeight: '600',
    color: '#166534',
    textAlign: 'center',
  },
  availableSubtitle: {
    fontSize: 14,
    color: '#166534',
    textAlign: 'center',
    marginTop: 4,
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
  },
  statusAssigned: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  statusAccepted: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
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
  passengerDetails: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  passengerTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  passengerInfo: {
    fontSize: 14,
    marginBottom: 4,
  },
  passengerLabel: {
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
  rideActions: {
    marginTop: 16,
    gap: 12,
  },
  // Earnings Styles
  earningsContainer: {
    padding: 16,
  },
  earningsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  earningsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  earningsCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  totalEarnings: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
    borderWidth: 1,
  },
  totalRides: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
    borderWidth: 1,
  },
  averageEarnings: {
    backgroundColor: '#f3e8ff',
    borderColor: '#9333ea',
    borderWidth: 1,
  },
  earningsAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  earningsLabel: {
    fontWeight: '600',
    fontSize: 12,
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
  availableText: {
    color: '#166534',
  },
  offlineText: {
    color: '#6b7280',
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

export default DriverApp;