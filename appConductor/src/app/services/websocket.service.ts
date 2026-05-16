import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {

  private socket: Socket;

  constructor() {
    this.socket = io(environment.apiUrl.replace('/api', ''), {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('🟢 [Conductor] WebSocket conectado:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('🔴 [Conductor] WebSocket desconectado');
    });
  }

  // =========================
  // EVENTOS GLOBALES
  // =========================

  onEstadoRecorrido(callback: (data: any) => void) {
    this.socket.on('recorrido.estado', callback);
  }

  // =========================
  // LIMPIEZA
  // =========================

  off(evento: string) {
    this.socket.off(evento);
  }

  disconnect() {
    this.socket.disconnect();
  }
}
