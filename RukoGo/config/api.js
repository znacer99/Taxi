/**
 * API Configuration
 * Centralized configuration for API endpoints and WebSocket URLs
 */

// Determine if running on device or emulator
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get the local IP address for development
// For production, replace with your actual domain
const getApiUrl = () => {
  // Check if we have a custom API URL in app.json
  const customApiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (customApiUrl) {
    return customApiUrl;
  }

  // Development defaults
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Android emulator uses 10.0.2.2 to access host machine
      return 'http://10.0.2.2:8000';
    } else if (Platform.OS === 'ios') {
      // iOS simulator can use localhost
      return 'http://localhost:8000';
    } else {
      // For physical devices, you need to use your computer's IP address
      // Replace this with your actual IP address when testing on physical devices
      return 'http://192.168.1.100:8000'; // TODO: Update with your IP
    }
  }

  // Production URL
  return 'https://your-production-domain.com'; // TODO: Update for production
};

const getWebSocketUrl = () => {
  const apiUrl = getApiUrl();
  // Convert http:// to ws:// and https:// to wss://
  return apiUrl.replace(/^http/, 'ws');
};

export const API_BASE_URL = getApiUrl();
export const WS_BASE_URL = getWebSocketUrl();

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/api/auth/login/',
  REGISTER_PASSENGER: '/api/auth/register/passenger/',
  REGISTER_DRIVER: '/api/auth/register/driver/',
  LOGOUT: '/api/auth/logout/',
  
  // Rides
  RIDES: '/api/rides/',
  RIDE_DETAIL: (id) => `/api/rides/${id}/`,
  ACCEPT_RIDE: (id) => `/api/rides/${id}/accept_ride/`,
  START_RIDE: (id) => `/api/rides/${id}/start_ride/`,
  COMPLETE_RIDE: (id) => `/api/rides/${id}/complete_ride/`,
  CANCEL_RIDE: (id) => `/api/rides/${id}/cancel_ride/`,
  UPDATE_LOCATION: '/api/rides/update_location/',
  EARNINGS: '/api/rides/earnings/',
  
  // Profiles
  PASSENGER_PROFILE: '/api/passengers/me/',
  DRIVER_PROFILE: '/api/drivers/me/',
};

// WebSocket Endpoints
export const WS_ENDPOINTS = {
  DRIVER: (driverId, token) => `${WS_BASE_URL}/ws/driver/${driverId}/?token=${token}`,
  RIDE: (rideId, token) => `${WS_BASE_URL}/ws/ride/${rideId}/?token=${token}`,
};

// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 30000;

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // milliseconds
  BACKOFF_MULTIPLIER: 2,
};

// WebSocket configuration
export const WS_CONFIG = {
  RECONNECT_INTERVAL: 5000, // milliseconds
  MAX_RECONNECT_ATTEMPTS: 10,
  PING_INTERVAL: 30000, // Keep connection alive
};

// Location update configuration
export const LOCATION_CONFIG = {
  UPDATE_INTERVAL: 10000, // 10 seconds (reduced from 5)
  DISTANCE_FILTER: 50, // meters (increased from 10)
  ACCURACY: 'balanced', // 'high', 'balanced', or 'low'
};

// Polling configuration
export const POLLING_CONFIG = {
  ACTIVE_RIDE_INTERVAL: 10000, // 10 seconds (reduced from 3)
};

export default {
  API_BASE_URL,
  WS_BASE_URL,
  API_ENDPOINTS,
  WS_ENDPOINTS,
  REQUEST_TIMEOUT,
  RETRY_CONFIG,
  WS_CONFIG,
  LOCATION_CONFIG,
  POLLING_CONFIG,
};
