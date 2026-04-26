
import { Capacitor } from '@capacitor/core';

export const environment = {
  production: false,
  // Si está corriendo en Android nativo usa la IP del emulador, sino usa localhost para el navegador web
  apiUrl: Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api'
};

