import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { RutaResponse } from './rutas.service';

export interface RecorridoResponse {
  id: string;
  estado?: string;
  ruta_id?: string;
  rutaId?: string;
  fecha_programada?: string;
  ruta?: RutaResponse | null;
  vehiculo?: { placa?: string } | null;
}

export interface FotoRecorridoResponse {
  posicion_id: string;
  lat: number;
  lon: number;
  capturado_ts: number;
  imagen_url?: string;
  foto_url?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RecorridosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/operativo/recorridos/local`;

  obtenerRecorridos(): Observable<RecorridoResponse[]> {
    return this.http.get<any>(this.apiUrl)
      .pipe(map((resp) => this.extraerLista(resp)));
  }

  obtenerRecorridosActivos(): Observable<RecorridoResponse[]> {
    return this.obtenerRecorridos().pipe(
      map((recorridos) => recorridos.filter((recorrido) => this.estaEnOperacion(recorrido.estado)))
    );
  }

  obtenerRecorridosVisiblesCiudadano(): Observable<RecorridoResponse[]> {
    return this.obtenerRecorridos().pipe(
      map((recorridos) => recorridos.filter((recorrido) => this.esVisibleParaCiudadano(recorrido.estado)))
    );
  }

  obtenerFotosRecorrido(recorridoId: string): Observable<FotoRecorridoResponse[]> {
    return this.http
      .get<FotoRecorridoResponse[]>(`${environment.apiUrl}/operativo/recorridos/${recorridoId}/posiciones/fotos`)
      .pipe(map((resp) => Array.isArray(resp) ? resp : []));
  }

  obtenerRutaId(recorrido: RecorridoResponse): string {
    return String(
      recorrido.ruta_id ??
      recorrido.rutaId ??
      recorrido.ruta?.id ??
      ''
    );
  }

  normalizarEstado(estado?: string) {
    return (estado ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  esActivo(estado?: string) {
    return ['activa', 'activo', 'en_curso'].includes(this.normalizarEstado(estado));
  }

  esProgramado(estado?: string) {
    return ['programada', 'programado'].includes(this.normalizarEstado(estado));
  }

  esPausado(estado?: string) {
    return ['pausado', 'pausada'].includes(this.normalizarEstado(estado));
  }

  esVisibleParaCiudadano(estado?: string) {
    return this.esActivo(estado) || this.esProgramado(estado) || this.esPausado(estado);
  }

  private estaEnOperacion(estado?: string) {
    return this.esActivo(estado) || this.esPausado(estado);
  }

  private extraerLista(resp: any): RecorridoResponse[] {
    if (Array.isArray(resp)) return resp;

    const candidatos = [
      resp?.data,
      resp?.recorridos,
      resp?.results,
      resp?.value,
      resp?.data?.data,
      resp?.data?.recorridos,
      resp?.data?.results,
      resp?.data?.value,
    ];

    return candidatos.find(Array.isArray) ?? [];
  }
}
