/**
 * API Utility Functions
 * Centralized API calls with proper error handling and response parsing
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, REQUEST_TIMEOUT, RETRY_CONFIG } from '../config/api';

/**
 * Get stored authentication token
 */
export const getAuthToken = async () => {
  try {
    return await AsyncStorage.getItem('access_token');
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

/**
 * Store authentication token
 */
export const setAuthToken = async (token) => {
  try {
    await AsyncStorage.setItem('access_token', token);
  } catch (error) {
    console.error('Error storing auth token:', error);
  }
};

/**
 * Remove authentication token
 */
export const removeAuthToken = async () => {
  try {
    await AsyncStorage.removeItem('access_token');
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
};

/**
 * Parse API response with proper error handling
 */
const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type');
  
  // Check if response is JSON
  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    
    // Handle standardized Django response format
    if (data.success !== undefined) {
      return {
        success: data.success,
        data: data.data || {},
        message: data.message || '',
        statusCode: response.status,
      };
    }
    
    // Handle non-standardized responses
    return {
      success: response.ok,
      data: data,
      message: response.statusText,
      statusCode: response.status,
    };
  }
  
  // Non-JSON response (likely an error page)
  const text = await response.text();
  return {
    success: false,
    data: {},
    message: `Server error: ${response.status} ${response.statusText}`,
    statusCode: response.status,
    rawResponse: text,
  };
};

/**
 * Make API request with retry logic
 */
const makeRequestWithRetry = async (url, options, retryCount = 0) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    // Retry on network errors
    if (retryCount < RETRY_CONFIG.MAX_RETRIES && 
        (error.name === 'AbortError' || error.message.includes('Network'))) {
      const delay = RETRY_CONFIG.RETRY_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      return makeRequestWithRetry(url, options, retryCount + 1);
    }
    throw error;
  }
};

/**
 * Make authenticated API request
 */
export const apiRequest = async (endpoint, options = {}) => {
  try {
    const token = await getAuthToken();
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    // Add auth token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const requestOptions = {
      ...options,
      headers,
    };
    
    const response = await makeRequestWithRetry(url, requestOptions);
    const parsedResponse = await parseResponse(response);
    
    // Handle 401 Unauthorized - token expired
    if (response.status === 401) {
      await removeAuthToken();
      throw new Error('Session expired. Please login again.');
    }
    
    // Throw error for non-successful responses
    if (!parsedResponse.success && response.status >= 400) {
      throw new Error(parsedResponse.message || 'Request failed');
    }
    
    return parsedResponse;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: (endpoint, options = {}) => 
    apiRequest(endpoint, { ...options, method: 'GET' }),
  
  post: (endpoint, data, options = {}) => 
    apiRequest(endpoint, { 
      ...options, 
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  put: (endpoint, data, options = {}) => 
    apiRequest(endpoint, { 
      ...options, 
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  patch: (endpoint, data, options = {}) => 
    apiRequest(endpoint, { 
      ...options, 
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  delete: (endpoint, options = {}) => 
    apiRequest(endpoint, { ...options, method: 'DELETE' }),
};

/**
 * Authentication API calls
 */
export const authApi = {
  login: async (username, password) => {
    const response = await api.post('/api/token/', { username, password });
    // Django JWT returns access token directly, not in standardized format
    if (response.access) {
      await setAuthToken(response.access);
      return { success: true, data: response };
    }
    return response;
  },
  
  registerPassenger: async (userData) => {
    const response = await api.post('/api/register/passenger/', userData);
    // Registration returns tokens directly
    if (response.access) {
      await setAuthToken(response.access);
      return { success: true, data: response };
    }
    return response;
  },
  
  registerDriver: async (userData) => {
    const response = await api.post('/api/register/driver/', userData);
    // Registration returns tokens directly
    if (response.access) {
      await setAuthToken(response.access);
      return { success: true, data: response };
    }
    return response;
  },
  
  logout: async () => {
    await removeAuthToken();
    // Clear any other stored data
    await AsyncStorage.multiRemove(['user_id', 'user_type', 'profile_id']);
  },
};

export default api;
