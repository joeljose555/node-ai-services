import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { logger } from './logger';

// Create axios instance with base configuration
const axiosInstance: AxiosInstance = axios.create({
  baseURL: process.env.SUMMARY_SERVICE_URL || 'http://localhost:3000/api',
//   timeout: parseInt(process.env.API_TIMEOUT || '10000'),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Log the outgoing request
    logger.info(`Making ${config.method?.toUpperCase()} request to: ${config.url}`);
    
    // Add authorization token if available
    const token = process.env.API_TOKEN;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add timestamp to request
    config.metadata = { startTime: new Date() };
    
    return config;
  },
  (error: AxiosError) => {
    logger.error('Request interceptor error:', error.message);
    return Promise.reject(error);
  }
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    // Calculate request duration
    const duration = new Date().getTime() - (response.config.metadata?.startTime?.getTime() || 0);
    
    logger.info(`Response received from ${response.config.url} - Status: ${response.status} - Duration: ${duration}ms`);
    
    return response;
  },
  (error: AxiosError) => {
    // Handle different types of errors
    if (error.response) {
      // Server responded with error status
      logger.error(`API Error - Status: ${error.response.status} - URL: ${error.config?.url} - Message: ${error.response.data}`);
    } else if (error.request) {
      // Request was made but no response received
      logger.error(`Network Error - No response received for URL: ${error.config?.url}`);
    } else {
      // Something else happened
      logger.error(`Request Setup Error: ${error.message}`);
    }
    
    return Promise.reject(error);
  }
);

// Extend InternalAxiosRequestConfig to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime?: Date;
    };
  }
}

export { axiosInstance };
export default axiosInstance;
