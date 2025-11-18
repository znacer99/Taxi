/**
 * Validation Utilities
 * Input validation and sanitization functions
 */

/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (basic validation)
 */
export const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-()]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

/**
 * Validate username
 */
export const isValidUsername = (username) => {
  return username && username.length >= 3 && username.length <= 30;
};

/**
 * Validate password strength
 */
export const isValidPassword = (password) => {
  return password && password.length >= 8;
};

/**
 * Validate coordinates
 */
export const isValidCoordinate = (lat, lng) => {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  
  return !isNaN(latitude) && 
         !isNaN(longitude) && 
         latitude >= -90 && 
         latitude <= 90 && 
         longitude >= -180 && 
         longitude <= 180;
};

/**
 * Validate location string
 */
export const isValidLocation = (location) => {
  return location && location.trim().length >= 3;
};

/**
 * Sanitize string input (prevent XSS)
 */
export const sanitizeString = (str) => {
  if (!str) return '';
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
};

/**
 * Validate ride request data
 */
export const validateRideRequest = (data) => {
  const errors = {};

  if (!isValidLocation(data.pickup_location)) {
    errors.pickup_location = 'Pickup location is required (minimum 3 characters)';
  }

  if (!isValidLocation(data.dropoff_location)) {
    errors.dropoff_location = 'Dropoff location is required (minimum 3 characters)';
  }

  if (!isValidCoordinate(data.pickup_lat, data.pickup_lng)) {
    errors.pickup_coordinates = 'Invalid pickup coordinates';
  }

  if (!isValidCoordinate(data.dropoff_lat, data.dropoff_lng)) {
    errors.dropoff_coordinates = 'Invalid dropoff coordinates';
  }

  // Check if pickup and dropoff are the same
  if (data.pickup_lat === data.dropoff_lat && data.pickup_lng === data.dropoff_lng) {
    errors.locations = 'Pickup and dropoff locations cannot be the same';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate registration data
 */
export const validateRegistration = (data, isDriver = false) => {
  const errors = {};

  if (!isValidUsername(data.username)) {
    errors.username = 'Username must be 3-30 characters';
  }

  if (!isValidEmail(data.email)) {
    errors.email = 'Invalid email address';
  }

  if (!isValidPassword(data.password)) {
    errors.password = 'Password must be at least 8 characters';
  }

  if (data.password !== data.password2) {
    errors.password2 = 'Passwords do not match';
  }

  if (!isValidPhone(data.phone_number)) {
    errors.phone_number = 'Invalid phone number';
  }

  // Driver-specific validation
  if (isDriver) {
    if (!data.car_model || data.car_model.trim().length < 2) {
      errors.car_model = 'Car model is required';
    }

    if (!data.car_plate || data.car_plate.trim().length < 2) {
      errors.car_plate = 'Car plate is required';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Parse coordinates safely
 */
export const parseCoordinates = (lat, lng, defaultLat = 0, defaultLng = 0) => {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isValidCoordinate(latitude, longitude)) {
    return { latitude, longitude };
  }

  console.warn('Invalid coordinates, using defaults:', { lat, lng });
  return { latitude: defaultLat, longitude: defaultLng };
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

/**
 * Validate distance is reasonable for a ride
 */
export const isValidRideDistance = (distance) => {
  // Distance should be between 0.1 km and 500 km
  return distance >= 0.1 && distance <= 500;
};

export default {
  isValidEmail,
  isValidPhone,
  isValidUsername,
  isValidPassword,
  isValidCoordinate,
  isValidLocation,
  sanitizeString,
  validateRideRequest,
  validateRegistration,
  parseCoordinates,
  calculateDistance,
  isValidRideDistance,
};
