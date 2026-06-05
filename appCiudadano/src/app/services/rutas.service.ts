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
  color_hex?: string;
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
    return this.http.get<any>(this.apiUrl)
      .pipe(map((resp) => this.extraerLista(resp)));
  }

  private extraerLista(resp: any): RutaResponse[] {
    if (Array.isArray(resp)) return resp;

    const candidatos = [
      resp?.data,
      resp?.rutas,
      resp?.results,
      resp?.value,
      resp?.data?.data,
      resp?.data?.rutas,
      resp?.data?.results,
      resp?.data?.value,
    ];

    return candidatos.find(Array.isArray) ?? [];
  }
}
