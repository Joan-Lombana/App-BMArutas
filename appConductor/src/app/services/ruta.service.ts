import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from, catchError, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Auth } from './auth';
import { OfflineService } from './offline.service';

// Interfaces de dominio de Ruta

export interface RutaShape {
  type: string;
  coordinates: number[][];  // GeoJSON: [lng, lat]
}

export interface Ruta {
  id: string;
  nombre_ruta: string;
  shape: RutaShape;
  // Campos adicionales para UI (BMAR-190)
  codigo?: string;
  horario?: string;
  estado?: string;
  paradas?: number;
  estimado?: string;
}


// Servicio para obtener coordenadas


@Injectable({
  providedIn: 'root'
})
export class RutaService {

  private http = inject(HttpClient);
  private auth = inject(Auth);
  private offlineService = inject(OfflineService);
  private apiUrl = `${environment.apiUrl}/operativo`;

  /**
   * Obtiene todas las rutas disponibles en el backend.
   */
  obtenerRutas(): Observable<Ruta[]> {
    return this.http
      .get<any>(`${this.apiUrl}/rutas`, this.auth.getAuthHeaders())
      .pipe(
        map((resp: any) => {
          // El backend devuelve { data: [...] } o directamente [...]
          const rutas = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : []);
          return rutas as Ruta[];
        }),
        catchError((err) => {
          console.warn('⚠️ No se pudo obtener rutas del backend.');
          return of([]);
        })
      );
  }

  // Obtiene una ruta por su ID.
  obtenerRutaPorId(id: string): Observable<Ruta | null> {
    return this.http
      .get<Ruta>(`${this.apiUrl}/rutas/${id}`, this.auth.getAuthHeaders())
      .pipe(
        catchError(() => {
          console.warn(`⚠️ No se pudo obtener ruta ${id}.`);
          return of(null);
        })
      );
  }

  // Convierte coordenadas GeoJSON [lng, lat] al formato Leaflet [lat, lng]
  geoJsonALeaflet(coordinates: number[][]): [number, number][] {
    return coordinates.map(([lng, lat]) => [lat, lng]);
  }

  /**
   * Obtiene el recorrido ASIGNADO al conductor autenticado.
   * Filtra por conductor_id del usuario en sesión.
   */
  obtenerRecorridoAsignado(): Observable<any | null> {
    const user = this.auth.currentUser();
    const conductorId = user?.id;

    return this.http
      .get<any[]>(`${this.apiUrl}/recorridos/local`, this.auth.getAuthHeaders())
      .pipe(
        catchError((err) => {
          console.warn('⚠️ No se pudo obtener recorridos del backend.');
          return of([]);
        }),
        map((recorridos: any[]) => {
          if (!recorridos || recorridos.length === 0) return null;
          // Filtrar por conductor_id y estado activo/programado
          const miRecorrido = recorridos.find(
            r => r.conductor_id === conductorId &&
            (r.estado === 'Activa' || r.estado === 'Programada' || r.estado === 'Pausado')
          ) ?? null;
          console.log('🔍 Recorridos del sistema:', recorridos.length, '| Mi recorrido:', miRecorrido);
          return miRecorrido;
        }),
        switchMap((recorrido: any | null) => {
          if (!recorrido) return of(null);
          // Traer TODAS las rutas y buscar la que corresponde (evita el bug del /rutas/:id)
          return this.obtenerRutas().pipe(
            map((rutas: Ruta[]) => {
              const ruta = rutas.find(r => r.id === recorrido.ruta_id) ?? null;
              console.log('🗺 Ruta encontrada para recorrido:', ruta?.nombre_ruta ?? 'no encontrada');
              return ruta ? { recorrido, ruta } : null;
            })
          );
        })
      );
  }
  // =============================================
  // RECORRIDOS (Nuevos Endpoints del Backend)
  // =============================================

  /**
   * Crea un nuevo registro de recorrido para la ruta actual.
   */
  crearRecorrido(rutaId: string, conductorId: string, vehiculoId: string): Observable<any> {
    const payload = {
      ruta_id: rutaId,
      conductor_id: conductorId,
      vehiculo_id: vehiculoId
    };
    return this.http.post(`${this.apiUrl}/recorridos/crear`, payload, this.auth.getAuthHeaders());
  }

  /**
   * Marca el recorrido como 'en_curso'.
   */
  iniciarRecorrido(recorridoId: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/recorridos/${recorridoId}/iniciar`, {}, this.auth.getAuthHeaders());
  }

  /**
   * Finaliza el recorrido.
   */
  finalizarRecorrido(recorridoId: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/recorridos/${recorridoId}/finalizar`, {}, this.auth.getAuthHeaders());
  }

  /**
   * Envía la posición actual del conductor al backend.
   * Si no hay internet, la guarda localmente mediante el OfflineService.
   */
  enviarPosicion(recorridoId: string, lat: number, lng: number): Observable<any> {
    return from(this.offlineService.checkConexionActiva()).pipe(
      switchMap(hayConexion => {
        if (!hayConexion) {
          // Guardar localmente y devolver un Observable vacío/exitoso simulado
          this.offlineService.guardarPosicionPendiente(recorridoId, lat, lng);
          return of({ status: 'offline_queued' });
        }

        // Si hay conexión, enviar directamente con timestamp real
        const payload = {
          latitud: lat,
          longitud: lng,
          velocidad: 0,
          timestamp: Date.now() // BMAR-XXX: Importante enviar el timestamp
        };
        
        return this.http.post(`${this.apiUrl}/recorridos/${recorridoId}/posiciones`, payload, this.auth.getAuthHeaders()).pipe(
          catchError(err => {
            // Si da error (ej. timeout o micro-corte), lo guardamos también
            console.warn('Fallo al enviar posición, guardando en cola offline...', err);
            this.offlineService.guardarPosicionPendiente(recorridoId, lat, lng);
            return of({ status: 'error_queued' });
          })
        );
      })
    );
  }
}
