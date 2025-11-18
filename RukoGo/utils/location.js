/**
 * Location Utilities
 * Handle location permissions and tracking
 */

import * as Location from 'expo-location';
import { LOCATION_CONFIG } from '../config/api';

/**
 * Request location permissions
 */
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      return {
        granted: false,
        error: 'Location permission denied. Please enable location access in settings.',
      };
    }

    return { granted: true };
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return {
      granted: false,
      error: 'Failed to request location permission',
    };
  }
};

/**
 * Get current location
 */
export const getCurrentLocation = async () => {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy[LOCATION_CONFIG.ACCURACY === 'high' ? 'High' : 
                                    LOCATION_CONFIG.ACCURACY === 'low' ? 'Low' : 'Balanced'],
    });

    return {
      success: true,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Start watching location with callback
 */
export const startLocationTracking = async (callback, options = {}) => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy[LOCATION_CONFIG.ACCURACY === 'high' ? 'High' : 
                                      LOCATION_CONFIG.ACCURACY === 'low' ? 'Low' : 'Balanced'],
        distanceInterval: options.distanceInterval || LOCATION_CONFIG.DISTANCE_FILTER,
        timeInterval: options.timeInterval || LOCATION_CONFIG.UPDATE_INTERVAL,
      },
      (location) => {
        callback({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: location.timestamp,
        });
      }
    );

    return subscription;
  } catch (error) {
    console.error('Error starting location tracking:', error);
    throw error;
  }
};

/**
 * Stop location tracking
 */
export const stopLocationTracking = (subscription) => {
  if (subscription) {
    subscription.remove();
  }
};

/**
 * Check if location services are enabled
 */
export const isLocationEnabled = async () => {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
};

/**
 * Get address from coordinates (reverse geocoding)
 */
export const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    const addresses = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    if (addresses && addresses.length > 0) {
      const address = addresses[0];
      return {
        success: true,
        address: `${address.street || ''} ${address.city || ''} ${address.region || ''}`.trim(),
        fullAddress: address,
      };
    }

    return {
      success: false,
      error: 'No address found',
    };
  } catch (error) {
    console.error('Error getting address:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get coordinates from address (geocoding)
 */
export const getCoordinatesFromAddress = async (address) => {
  try {
    const locations = await Location.geocodeAsync(address);

    if (locations && locations.length > 0) {
      const location = locations[0];
      return {
        success: true,
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }

    return {
      success: false,
      error: 'Address not found',
    };
  } catch (error) {
    console.error('Error geocoding address:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default {
  requestLocationPermission,
  getCurrentLocation,
  startLocationTracking,
  stopLocationTracking,
  isLocationEnabled,
  getAddressFromCoordinates,
  getCoordinatesFromAddress,
};
