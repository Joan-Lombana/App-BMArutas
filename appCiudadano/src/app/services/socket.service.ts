import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface PosicionReal {
  recorridoId: string;
  latitud: number;
  longitud: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  public conectado = signal(false);

  constructor() {
    this.socket = io(`${environment.socketUrl}/operativo`, {
      transports: ['websocket'],
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log('✅ Conectado al servidor de Sockets (Ciudadano)');
      this.conectado.set(true);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor de Sockets');
      this.conectado.set(false);
    });
  }

  // Escuchar posiciones de todos los vehículos (nueva y actualizada)
  onNuevaPosicion(callback: (pos: PosicionReal) => void) {
    this.socket.on('posicion', callback);
    this.socket.on('posicion.actualizada', callback);
  }

  offNuevaPosicion(callback: (pos: PosicionReal) => void) {
    this.socket.off('posicion', callback);
    this.socket.off('posicion.actualizada', callback);
  }

  // Escuchar cuando un recorrido cambia de estado (Iniciado/Finalizado)
  onEstadoRecorrido(callback: (data: any) => void) {
    this.socket.on('estadoRecorridoCambiado', callback);
  }

  offEstadoRecorrido(callback: (data: any) => void) {
    this.socket.off('estadoRecorridoCambiado', callback);
  }

  // Escuchar nuevas incidencias
  onNuevaIncidencia(callback: (data: any) => void) {
    this.socket.on('nuevaIncidencia', callback);
  }

  offNuevaIncidencia(callback: (data: any) => void) {
    this.socket.off('nuevaIncidencia', callback);
  }

  // Escuchar fotos en vivo de posiciones
  onLocationPhoto(callback: (data: any) => void) {
    this.socket.on('location:photo', callback);
  }

  offLocationPhoto(callback: (data: any) => void) {
    this.socket.off('location:photo', callback);
  }

  unirseRecorrido(recorridoId: string) {
    this.socket.emit('unirseRecorrido', recorridoId);
  }

  salirRecorrido(recorridoId: string) {
    this.socket.emit('salirRecorrido', recorridoId);
  }
}
