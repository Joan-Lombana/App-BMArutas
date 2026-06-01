import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { RutaResponse } from './rutas.service';

export interface RecorridoResponse {
  id: string;
  estado?: string;
  ruta_id?: string;
  ruta?: RutaResponse | null;
  vehiculo?: { placa?: string } | null;
}

@Injectable({
  providedIn: 'root'
})
export class RecorridosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/operativo/recorridos/local`;

  obtenerRecorridos(): Observable<RecorridoResponse[]> {
    return this.http.get<RecorridoResponse[] | { data?: RecorridoResponse[] }>(this.apiUrl)
      .pipe(map((resp) => Array.isArray(resp) ? resp : resp.data ?? []));
  }

  obtenerRecorridosActivos(): Observable<RecorridoResponse[]> {
    return this.obtenerRecorridos().pipe(
      map((recorridos) => recorridos.filter((recorrido) => this.estaActivo(recorrido.estado)))
    );
  }

  private estaActivo(estado?: string) {
    const normalizado = (estado ?? '').toLowerCase();
    return ['activa', 'activo', 'en_curso', 'en curso'].includes(normalizado);
  }
}
