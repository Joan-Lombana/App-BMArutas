import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: Socket;
  private conductorIdActual: string | null = null;

  constructor() {
    this.socket = io(environment.wsUrl, {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('🟢 WebSocket conductor conectado:', this.socket.id);
      if (this.conductorIdActual) {
        this.socket.emit('unirseConductor', this.conductorIdActual);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('🔴 WebSocket conductor desconectado');
    });
  }

  unirseRecorrido(recorridoId: string) {
    this.socket.emit('unirseRecorrido', recorridoId);
  }

  salirRecorrido(recorridoId: string) {
    this.socket.emit('salirRecorrido', recorridoId);
  }

  unirseConductor(conductorId: string) {
    this.conductorIdActual = conductorId;
    this.socket.emit('unirseConductor', conductorId);
  }

  salirConductor(conductorId: string) {
    this.socket.emit('salirConductor', conductorId);
  }

  emitirPosicion(posicion: {
    id: string;
    recorridoId: string;
    latitud: number;
    longitud: number;
    timestamp: number;
    velocidad?: number;
  }) {
    this.socket.emit('posicion', posicion);
  }

  onEstadoRecorrido(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('recorrido.estado', handler);
      return () => this.socket.off('recorrido.estado', handler);
    });
  }

  onRecorridoEliminado(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('recorrido.eliminado', handler);
      return () => this.socket.off('recorrido.eliminado', handler);
    });
  }

  onRecorridoAsignado(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('recorrido.asignado', handler);
      return () => this.socket.off('recorrido.asignado', handler);
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}
