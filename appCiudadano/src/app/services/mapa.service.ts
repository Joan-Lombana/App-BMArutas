import { Injectable, signal } from '@angular/core';
import * as L from 'leaflet';

export interface RutaSeleccionada {
  id: string;
  nombre: string;
  color: string;
  shape?: string | { type: string; coordinates: number[][] | number[][][] };
}

/**
 * Servicio compartido entre la pestaña Rutas y el Mapa.
 * Cuando el usuario toca "Ver en mapa" desde Rutas, se guarda
 * la ruta aquí y el Dashboard la pinta en Leaflet.
 */
@Injectable({
  providedIn: 'root'
})
export class MapaService {

  /** Ruta actualmente seleccionada para mostrar en el mapa */
  public rutaSeleccionada = signal<RutaSeleccionada | null>(null);

  private getVehicleIcon(color: string = '#96B4EA') {
    return L.divIcon({
      html: `
        <div style="
          position: relative;
          width: 120px; 
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <!-- Círculo de radio translúcido -->
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            background: ${color}40; /* 40 es la opacidad en hex */
            border-radius: 50%;
            border: 1px solid ${color}80;
          "></div>
          <!-- Pin central -->
          <div style="
            position: relative;
            background: ${color};
            width: 36px; height: 36px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 3px solid #21262d;
            font-size: 16px;
            color: white;
            z-index: 2;
          ">
            <ion-icon name="trash" style="font-size: 18px;"></ion-icon>
          </div>
        </div>
      `,
      iconSize: [120, 120],
      iconAnchor: [60, 60],
      popupAnchor: [0, -20],
      className: ''
    });
  }

  constructor() {}

  crearMarcadorVehiculo(lat: number, lng: number, placa: string, color?: string): L.Marker {
    const marker = L.marker([lat, lng], { icon: this.getVehicleIcon(color) });
    marker.bindPopup(`<b>Camión: ${placa}</b><br>En ruta de recolección`);
    return marker;
  }

  crearMarcadorIncidencia(lat: number, lng: number, tipo: string, desc: string): L.Marker {
    const icon = L.divIcon({
      html: `
        <div style="position: relative; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 100%; height: 100%; background: rgba(239,68,68,0.25); border-radius: 50%; border: 1px solid rgba(239,68,68,0.5);"></div>
          <div style="position: relative; background: #EF4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 8px rgba(239,68,68,0.4); z-index: 2;">
            <ion-icon name="warning" style="color: white; font-size: 16px;"></ion-icon>
          </div>
        </div>
      `,
      iconSize: [100, 100],
      iconAnchor: [50, 50],
      popupAnchor: [0, -15],
      className: ''
    });
    const marker = L.marker([lat, lng], { icon });
    marker.bindPopup(`<b>🚨 ${tipo}</b><br>${desc}`);
    return marker;
  }

  dibujarRuta(map: L.Map, coordinates: [number, number][], color: string = '#96B4EA'): L.Polyline {
    return L.polyline(coordinates, {
      color,
      weight: 5,
      opacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(map);
  }

  extraerCoordenadasRuta(shape: RutaSeleccionada['shape']): [number, number][] {
    const parsedShape = this.parseShape(shape);
    const coordinates = parsedShape?.coordinates;

    if (!Array.isArray(coordinates)) return [];

    let rawCoords: number[][] = [];
    if (parsedShape?.type === 'LineString') {
      rawCoords = coordinates as number[][];
    } else if (parsedShape?.type === 'MultiLineString') {
      rawCoords = ([] as number[][]).concat(...(coordinates as number[][][]));
    } else if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
      rawCoords = coordinates as number[][];
    }

    return rawCoords
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => [coord[1], coord[0]] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  }

  seleccionarRutaParaMapa(ruta: RutaSeleccionada) {
    this.rutaSeleccionada.set(ruta);
  }

  limpiarRutaSeleccionada() {
    this.rutaSeleccionada.set(null);
  }

  crearMarcadorFoto(
    lat: number,
    lon: number,
    posicionId: string,
    timestamp: number,
    apiUrl: string,
    imagenUrl?: string
  ): L.Marker {
    const fecha = new Date(timestamp);
    const dateStr = fecha.toLocaleString('es-ES', { 
      day: 'numeric', month: 'numeric', year: 'numeric', 
      hour: 'numeric', minute: 'numeric', second: 'numeric' 
    });

    const cameraIcon = L.divIcon({
      html: `
        <div style="position: relative; width: 36px; height: 36px;">
          <div style="
            width: 36px; 
            height: 36px; 
            background: #3b82f6; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 2;
            position: relative;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
              <circle cx="12" cy="13" r="3"></circle>
            </svg>
          </div>
          <div style="
            position: absolute;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 0; 
            height: 0; 
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 8px solid #3b82f6;
            z-index: 1;
          "></div>
        </div>
      `,
      className: '',
      iconSize: [36, 42],
      iconAnchor: [18, 42],
      popupAnchor: [0, -42]
    });

    const marker = L.marker([lat, lon], { icon: cameraIcon });
    const srcImagen = this.normalizarUrlImagen(posicionId, apiUrl, imagenUrl);
    
    const popupContent = `
      <div style="position: relative; width: 200px; height: 260px; border-radius: 12px; overflow: hidden; background: #000; box-shadow: 0 8px 16px rgba(0,0,0,0.4);">
        <img src="${srcImagen}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.src=&quot;data:image/svg+xml;utf8,&lt;svg xmlns='http://www.w3.org/2000/svg' width='200' height='260' viewBox='0 0 200 260'&gt;&lt;rect width='200' height='260' fill='%231f2937'/&gt;&lt;circle cx='100' cy='110' r='32' fill='%23374151'/&gt;&lt;path d='M100 98v24M88 110h24' stroke='%239ca3af' stroke-width='3' stroke-linecap='round'/&gt;&lt;text x='100' y='170' fill='%239ca3af' font-family='sans-serif' font-size='13' font-weight='bold' text-anchor='middle'&gt;Imagen no&lt;/text&gt;&lt;text x='100' y='190' fill='%239ca3af' font-family='sans-serif' font-size='13' font-weight='bold' text-anchor='middle'&gt;disponible&lt;/text&gt;&lt;/svg&gt;&quot;" />
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 20px 12px 12px; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%); color: white; font-family: sans-serif; font-size: 11px; font-weight: 500; text-align: center; pointer-events: none;">
          Recolección en vivo<br>${dateStr}
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, {
      maxWidth: 200,
      minWidth: 200,
      closeButton: true
    });

    return marker;
  }

  private normalizarUrlImagen(posicionId: string, apiUrl: string, imagenUrl?: string): string {
    const fallback = `${apiUrl}/operativo/recorridos/posiciones/${posicionId}/imagen`;
    if (!imagenUrl) return fallback;
    if (/^https?:\/\//i.test(imagenUrl) || imagenUrl.startsWith('data:image/')) return imagenUrl;

    const apiOrigin = apiUrl.replace(/\/api\/?$/, '');
    if (imagenUrl.startsWith('/api/')) return `${apiOrigin}${imagenUrl}`;
    if (imagenUrl.startsWith('/')) return `${apiUrl}${imagenUrl}`;
    return `${apiUrl}/${imagenUrl}`;
  }

  private parseShape(shape: RutaSeleccionada['shape']) {
    if (!shape) return null;
    if (typeof shape !== 'string') return shape;

    try {
      return JSON.parse(shape);
    } catch {
      return null;
    }
  }
}
