import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from, catchError, map, switchMap, throwError } from 'rxjs';
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

  private recorridoIdSeleccionado: string | null = null;

  setRecorridoSeleccionado(id: string | null) {
    this.recorridoIdSeleccionado = id;
  }

  getRecorridoSeleccionado(): string | null {
    return this.recorridoIdSeleccionado;
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
          console.warn('No se pudo obtener recorridos del backend.');
          return of([]);
        }),
        map((recorridos: any[]) => {
          if (!recorridos || recorridos.length === 0) return null;
          
          // Si el usuario seleccionó uno específico, lo priorizamos
          const seleccionadoId = this.getRecorridoSeleccionado();
          if (seleccionadoId) {
            const match = recorridos.find(r => r.id === seleccionadoId);
            if (match) return match;
          }

          const miRecorrido = recorridos.find(
            r => r.conductor_id === conductorId &&
            (r.estado === 'Activa' || r.estado === 'Programada' || r.estado === 'Pausado')
          ) ?? null;
          return miRecorrido;
        }),
        switchMap((recorrido: any | null) => {
          if (!recorrido) return of(null);
          return this.obtenerRutas().pipe(
            map((rutas: Ruta[]) => {
              const ruta = rutas.find(r => r.id === recorrido.ruta_id) ?? null;
              return ruta ? { recorrido, ruta } : null;
            })
          );
        })
      );
  }

  // Devuelve TODOS los recorridos activos/programados asignados al conductor.
  obtenerTodosLosRecorridosAsignados(): Observable<any[]> {
    const user = this.auth.currentUser();
    const conductorId = user?.id;

    return this.http
      .get<any[]>(`${this.apiUrl}/recorridos/local`, this.auth.getAuthHeaders())
      .pipe(
        catchError(() => {
          console.warn('No se pudo obtener recorridos del backend.');
          return of([]);
        }),
        map((recorridos: any[]) => {
          if (!recorridos || recorridos.length === 0) return [];
          return recorridos.filter(
            r => r.conductor_id === conductorId &&
            (r.estado === 'Activa' || r.estado === 'Programada' || r.estado === 'Pausado')
          );
        }),
        switchMap((misRecorridos: any[]) => {
          if (misRecorridos.length === 0) return of([]);
          return this.obtenerRutas().pipe(
            map((rutas: Ruta[]) =>
              misRecorridos.map(recorrido => {
                const ruta = rutas.find(r => r.id === recorrido.ruta_id) ?? null;
                return ruta ? { recorrido, ruta } : null;
              }).filter(Boolean)
            )
          );
        })
      );
  }

  // Calcula el progreso del día (rutas completadas vs total asignadas hoy)
  obtenerProgresoDelDia(): Observable<{ total: number; completadas: number; porcentaje: number }> {
    const user = this.auth.currentUser();
    const conductorId = user?.id;

    return this.http
      .get<any[]>(`${this.apiUrl}/recorridos/local`, this.auth.getAuthHeaders())
      .pipe(
        catchError(() => of([])),
        map((recorridos: any[]) => {
          if (!recorridos || recorridos.length === 0) return { total: 0, completadas: 0, porcentaje: 0 };
          
          // Filtrar los del conductor para el día de hoy
          const hoy = new Date().toISOString().split('T')[0];
          const rutasDeHoy = recorridos.filter(r => {
             const esConductor = r.conductor_id === conductorId;
             // Si el backend tiene createdAt lo usamos, si no, lo incluimos (para la demo)
             const fecha = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : hoy;
             return esConductor && fecha === hoy;
          });

          const total = rutasDeHoy.length;
          const completadas = rutasDeHoy.filter(r => r.estado === 'Finalizado').length;
          const porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

          return { total, completadas, porcentaje };
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
   * Pausa el recorrido actual.
   */
  pausarRecorrido(recorridoId: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/recorridos/${recorridoId}/pausar`, {}, this.auth.getAuthHeaders());
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

  // =============================================
  // INCIDENCIAS (Pendiente Backend)
  // =============================================
  reportarIncidencia(recorridoId: string | null, payload: any): Observable<any> {
    // El compañero de backend debe crear este endpoint
    // POST /api/operativo/incidencias
    return this.http.post(`${this.apiUrl}/incidencias`, {
      recorrido_id: recorridoId,
      ...payload,
      timestamp: Date.now()
    }, this.auth.getAuthHeaders());
  }

  /**
   * Sube una foto en Base64 vinculada a una posición GPS específica.
   * Paso 2 del flujo de la guía técnica de fotos.
   * POST /api/operativo/recorridos/posiciones/:posicion_id/imagen
   */
  subirFotoPosicion(posicionId: string, imagenBase64: string): Observable<any> {
    const payload = { imagen: imagenBase64 };
    return this.http.post(
      `${this.apiUrl}/recorridos/posiciones/${posicionId}/imagen`,
      payload,
      this.auth.getAuthHeaders()
    ).pipe(
      catchError(err => {
        console.warn('⚠️ No se pudo subir la foto al servidor:', err);
        return throwError(() => err);
      })
    );
  }
}

