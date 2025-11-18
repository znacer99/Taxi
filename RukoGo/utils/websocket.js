/**
 * WebSocket Utility
 * Manages WebSocket connections with automatic reconnection and proper cleanup
 */

import { WS_CONFIG } from '../config/api';

export class WebSocketManager {
  constructor(url, options = {}) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.isIntentionallyClosed = false;
    this.messageQueue = [];
    
    // Callbacks
    this.onOpen = options.onOpen || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onError = options.onError || (() => {});
    this.onClose = options.onClose || (() => {});
    
    // Configuration
    this.maxReconnectAttempts = options.maxReconnectAttempts || WS_CONFIG.MAX_RECONNECT_ATTEMPTS;
    this.reconnectInterval = options.reconnectInterval || WS_CONFIG.RECONNECT_INTERVAL;
    this.pingInterval = options.pingInterval || WS_CONFIG.PING_INTERVAL;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    // Prevent multiple connections
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    this.isIntentionallyClosed = false;

    try {
      console.log('Connecting to WebSocket:', this.url);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startPing();
        
        // Send queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          this.send(message);
        }
        
        this.onOpen();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.onMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.onMessage(event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.onError(error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.stopPing();
        this.onClose(event);

        // Attempt to reconnect if not intentionally closed
        if (!this.isIntentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          this.onError(new Error('Failed to reconnect after maximum attempts'));
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.onError(error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send message through WebSocket
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
    } else {
      console.warn('WebSocket not open, queueing message');
      this.messageQueue.push(data);
    }
  }

  /**
   * Start ping to keep connection alive
   */
  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, this.pingInterval);
  }

  /**
   * Stop ping timer
   */
  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Close WebSocket connection
   */
  close() {
    this.isIntentionallyClosed = true;
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();

    // Close connection
    if (this.ws) {
      this.ws.close(1000, 'Client closing connection');
      this.ws = null;
    }

    // Clear message queue
    this.messageQueue = [];
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState() {
    if (!this.ws) return 'CLOSED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }
}

export default WebSocketManager;
