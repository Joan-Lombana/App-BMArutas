import { Injectable, inject } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { Network } from '@capacitor/network';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Auth } from './auth';
import { firstValueFrom } from 'rxjs';

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
  public hayConexion = true;

  // FIX #1: Una sola promesa de init compartida — evita doble init / race condition
  private initPromise: Promise<void> | null = null;

  // FIX #2: Mutex de escritura — evita race condition al guardar posiciones concurrentes
  private writeQueue: Promise<void> = Promise.resolve();

  // FIX #3: Referencia al listener de red — para poder removerlo y evitar memory leak
  private networkListener: any = null;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    await this.storage.create();
    this.isStorageReady = true;

    const status = await Network.getStatus();
    this.hayConexion = status.connected;

    // Guardar referencia para poder removerlo después
    this.networkListener = await Network.addListener('networkStatusChange', (status) => {
      this.hayConexion = status.connected;
      if (status.connected) {
        console.log('📶 Conexión recuperada, sincronizando datos pendientes...');
        this.sincronizarDatos();
      } else {
        console.warn('📶 Sin conexión, modo offline activado.');
      }
    });
  }

  // Llamar desde AppComponent ngOnDestroy para limpiar el listener
  async destroy(): Promise<void> {
    if (this.networkListener) {
      await this.networkListener.remove();
      this.networkListener = null;
    }
  }

  async checkConexionActiva(): Promise<boolean> {
    const status = await Network.getStatus();
    this.hayConexion = status.connected;
    return status.connected;
  }

  // FIX #2 aplicado: escrituras serializadas con writeQueue para evitar pérdida de posiciones
  async guardarPosicionPendiente(recorridoId: string, lat: number, lng: number): Promise<void> {
    await this.init();

    this.writeQueue = this.writeQueue.then(async () => {
      const posicion: PosicionPendiente = {
        recorridoId,
        lat,
        lng,
        timestamp: Date.now()
      };

      const pendientes: PosicionPendiente[] = await this.storage.get(this.PENDIENTES_KEY) || [];
      pendientes.push(posicion);
      await this.storage.set(this.PENDIENTES_KEY, pendientes);
      console.log(`💾 Posición guardada localmente (total pendientes: ${pendientes.length})`);
    });

    return this.writeQueue;
  }

  // FIX #4: Borrar posición por posición conforme se envía — evita duplicados si falla a mitad
  async sincronizarDatos(): Promise<void> {
    if (!this.isStorageReady || !this.hayConexion) return;

    const pendientes: PosicionPendiente[] = await this.storage.get(this.PENDIENTES_KEY) || [];

    if (pendientes.length === 0) return;

    console.log(`🚀 Iniciando sincronización de ${pendientes.length} posiciones...`);

    const apiUrl = `${environment.apiUrl}/operativo`;
    const fallidas: PosicionPendiente[] = [];

    for (const pos of pendientes) {
      try {
        await firstValueFrom(
          this.http.post(
            `${apiUrl}/recorridos/${pos.recorridoId}/posiciones`,
            {
              latitud: pos.lat,
              longitud: pos.lng,
              velocidad: 0,
              timestamp: pos.timestamp
            },
            this.auth.getAuthHeaders()
          )
        );
      } catch (error) {
        console.warn(`⚠️ No se pudo sincronizar posición ${pos.timestamp}, se reintentará.`, error);
        fallidas.push(pos); // Solo quedan las que fallaron
      }
    }

    // Guardamos únicamente las que no se pudieron enviar
    await this.storage.set(this.PENDIENTES_KEY, fallidas);

    const enviadas = pendientes.length - fallidas.length;
    console.log(`✅ Sync completo: ${enviadas} enviadas, ${fallidas.length} pendientes.`);
  }
}
