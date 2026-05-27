import { Capacitor } from '@capacitor/core';

export const environment = {
  production: false,
  apiUrl: Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api',
  socketUrl: Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000'
};
