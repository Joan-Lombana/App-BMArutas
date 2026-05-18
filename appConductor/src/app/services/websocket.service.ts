import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: Socket;

  constructor() {
    this.socket = io(environment.wsUrl, {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('🟢 WebSocket conductor conectado:', this.socket.id);
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
    this.socket.emit('unirseConductor', conductorId);
  }

  salirConductor(conductorId: string) {
    this.socket.emit('salirConductor', conductorId);
  }

  onEstadoRecorrido(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('recorrido.estado', (data: any) => {
        observer.next(data);
      });

      return () => {
        this.socket.off('recorrido.estado');
      };
    });
  }

  onRecorridoEliminado(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('recorrido.eliminado', (data: any) => {
        observer.next(data);
      });

      return () => {
        this.socket.off('recorrido.eliminado');
      };
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}
