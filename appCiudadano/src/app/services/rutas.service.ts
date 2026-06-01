import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface RutaResponse {
  id: string;
  nombre_ruta: string;
  descripcion?: string;
  color?: string;
  activa?: boolean;
  paradas?: number;
  frecuencia?: string;
  shape?: string | {
    type: string;
    coordinates: number[][] | number[][][];
  };
}

@Injectable({
  providedIn: 'root'
})
export class RutasService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/operativo/rutas`;

  constructor() { }

  obtenerRutas(): Observable<RutaResponse[]> {
    return this.http.get<RutaResponse[] | { data?: RutaResponse[]; rutas?: RutaResponse[]; results?: RutaResponse[] }>(this.apiUrl)
      .pipe(map((resp) => {
        if (Array.isArray(resp)) return resp;
        return resp.data ?? resp.rutas ?? resp.results ?? [];
      }));
  }
}
