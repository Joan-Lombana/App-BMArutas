import { Injectable, inject } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { Network, ConnectionStatus } from '@capacitor/network';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Auth } from './auth';

export interface PosicionPendiente {
  recorridoId: string;
  lat: number;
  lng: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineService {
  private storage = inject(Storage);
  private http = inject(HttpClient);
  private auth = inject(Auth);

  private isStorageReady = false;
  private readonly PENDIENTES_KEY = 'posiciones_pendientes';
  public hayConexion = true; // ✅ Público para la UI


  constructor() {
    this.init();
  }

  async init() {
    await this.storage.create();
    this.isStorageReady = true;

    // Verificar estado actual
    const status = await Network.getStatus();
    this.hayConexion = status.connected;

    // Escuchar cambios de red
    Network.addListener('networkStatusChange', status => {
      this.hayConexion = status.connected;
      if (status.connected) {
        console.log('📶 Conexión recuperada, sincronizando datos pendientes...');
        this.sincronizarDatos();
      } else {
        console.warn('📶 Sin conexión, modo offline activado.');
      }
    });
  }

  // Verifica el estado de la red sin esperar al listener
  async checkConexionActiva(): Promise<boolean> {
    const status = await Network.getStatus();
    this.hayConexion = status.connected;
    return status.connected;
  }

  // Guardar posición en la base de datos local SQLite/IndexedDB
  async guardarPosicionPendiente(recorridoId: string, lat: number, lng: number) {
    if (!this.isStorageReady) await this.init();

    const posicion: PosicionPendiente = {
      recorridoId,
      lat,
      lng,
      timestamp: Date.now()
    };

    let pendientes = await this.storage.get(this.PENDIENTES_KEY) || [];
    pendientes.push(posicion);
    
    await this.storage.set(this.PENDIENTES_KEY, pendientes);
    console.log(`💾 Posición guardada localmente (total pendientes: ${pendientes.length})`);
  }

  // Enviar todas las posiciones acumuladas al backend de golpe
  async sincronizarDatos() {
    if (!this.isStorageReady) return;
    if (!this.hayConexion) return;

    const pendientes: PosicionPendiente[] = await this.storage.get(this.PENDIENTES_KEY) || [];
    
    if (pendientes.length === 0) {
      return; // Nada que sincronizar
    }

    console.log(`🚀 Iniciando sincronización de ${pendientes.length} posiciones...`);

    // El backend necesitará un endpoint para recibir un array de posiciones con su timestamp real,
    // o enviarlas una por una (menos eficiente pero sirve por ahora).
    const apiUrl = `${environment.apiUrl}/operativo`;
    
    try {
      // Como el backend actual espera un POST por posición, podemos enviarlas iterando 
      // o adaptar el backend a un endpoint '/sync'. Por ahora, mandamos al mismo endpoint:
      for (const pos of pendientes) {
        await this.http.post(`${apiUrl}/recorridos/${pos.recorridoId}/posiciones`, {
          latitud: pos.lat,
          longitud: pos.lng,
          velocidad: 0,
          timestamp: pos.timestamp // BMAR-XXX: El backend debe leer este campo para no usar la hora de llegada
        }, this.auth.getAuthHeaders()).toPromise();
      }

      // Si todo salió bien, vaciamos la base de datos local
      await this.storage.set(this.PENDIENTES_KEY, []);
      console.log('✅ Sincronización completada con éxito.');

    } catch (error) {
      console.error('❌ Falló la sincronización. Se intentará de nuevo más tarde.', error);
      // No borramos la base de datos si falla, así no se pierden los datos.
    }
  }
}
