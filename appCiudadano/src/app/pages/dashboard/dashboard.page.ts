import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  navigate, trash, notifications, layers, searchOutline,
  personCircleOutline, chevronDownOutline, chevronForwardOutline,
  mapOutline, chevronUpOutline
} from 'ionicons/icons';
import * as L from 'leaflet';
import { SocketService, PosicionReal } from '../../services/socket.service';
import { MapaService } from '../../services/mapa.service';
import { RecorridosService } from '../../services/recorridos.service';
import { environment } from '../../../environments/environment';


interface CamionActivo {
  recorridoId: string;
  nombre: string;
  estado: 'en_ruta' | 'demorado' | 'finalizado';
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonIcon
  ]
})
export class DashboardPage implements OnInit, OnDestroy {

  private map?: L.Map;
  private socket = inject(SocketService);
  private mapaService = inject(MapaService);
  private recorridosService = inject(RecorridosService);
  private router = inject(Router);

  private vehiculosMarkers = new Map<string, L.Marker>();
  private rutaPolyline?: L.Polyline;
  private recorridosUnidos = new Set<string>();
  private userCircle?: L.Circle;
  private photoMarkers: L.Marker[] = [];

  public cargando = signal(true);
  public vehiculosEnLinea = signal(0);
  public camionesActivos = signal<CamionActivo[]>([]);
  public panelAbierto = signal(true);
  public filtroActivo = signal<'todas'|'camiones'|'alertas'>('todas');
  private onNuevaPosicion = (pos: PosicionReal) => this.actualizarMarcadorVehiculo(pos);
  private onLivePhoto = (data: any) => this.actualizarMarcadorFoto(data);


  constructor() {
    addIcons({
      navigate, trash, notifications, layers, searchOutline,
      personCircleOutline, chevronDownOutline, chevronForwardOutline, mapOutline,
      chevronUpOutline
    });

    effect(() => {
      const ruta = this.mapaService.rutaSeleccionada();
      if (ruta && this.map) {
        this.mostrarRutaEnMapa(ruta);
        this.panelAbierto.set(true);
      }
    });
  }

  ngOnInit() {
    setTimeout(() => {
      this.initMap();
      this.escucharSockets();
      this.cargarRecorridosActivos();
      this.recuperarUbicacion();
    }, 400);
  }

  ngOnDestroy() {
    this.socket.offNuevaPosicion(this.onNuevaPosicion);
    this.socket.offLocationPhoto(this.onLivePhoto);
    this.recorridosUnidos.forEach((recorridoId) => this.socket.salirRecorrido(recorridoId));
    this.photoMarkers.forEach(m => this.map && m.remove());
    this.photoMarkers = [];
    if (this.map) this.map.remove();
  }

  private initMap() {
    this.map = L.map('map-citizen', {
      zoomControl: false,
      attributionControl: false
    }).setView([3.8801, -77.0312], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);

    this.cargando.set(false);
  }

  private escucharSockets() {
    this.socket.offNuevaPosicion(this.onNuevaPosicion);
    this.socket.onNuevaPosicion(this.onNuevaPosicion);
    this.socket.onLocationPhoto(this.onLivePhoto);
  }

  private actualizarMarcadorFoto(data: any) {
    if (!this.map) return;
    console.log('📷 Foto en vivo recibida en ciudadano:', data);
    if (data.lat && data.lon && data.posicion_id) {
      const marker = this.mapaService.crearMarcadorFoto(
        data.lat,
        data.lon,
        data.posicion_id,
        data.capturado_ts || Date.now(),
        environment.apiUrl
      ).addTo(this.map);
      this.photoMarkers.push(marker);
    }
  }

  private cargarRecorridosActivos() {
    this.recorridosService.obtenerRecorridosActivos().subscribe({
      next: (recorridos) => {
        recorridos.forEach((recorrido) => {
          this.socket.unirseRecorrido(recorrido.id);
          this.recorridosUnidos.add(recorrido.id);

          const ruta = recorrido.ruta;
          if (ruta?.shape && this.map && !this.rutaPolyline) {
            this.mostrarRutaEnMapa({ shape: ruta.shape });
          }
        });
      },
      error: (err) => console.warn('No se pudieron cargar recorridos activos', err)
    });
  }

  private actualizarMarcadorVehiculo(pos: PosicionReal) {
    if (!this.map) return;

    let marker = this.vehiculosMarkers.get(pos.recorridoId);

    if (marker) {
      marker.setLatLng([pos.latitud, pos.longitud]);
    } else {
      marker = this.mapaService.crearMarcadorVehiculo(pos.latitud, pos.longitud, pos.recorridoId)
        .addTo(this.map);
      this.vehiculosMarkers.set(pos.recorridoId, marker);
      this.vehiculosEnLinea.update(n => n + 1);

      this.camionesActivos.update(lista => [...lista, {
        recorridoId: pos.recorridoId,
        nombre: `T-${pos.recorridoId.substring(0, 3).toUpperCase()}`,
        estado: 'en_ruta',
        lat: pos.latitud,
        lng: pos.longitud
      }]);
    }
  }

  private mostrarRutaEnMapa(ruta: any) {
    if (!this.map) return;

    if (this.rutaPolyline) {
      this.rutaPolyline.remove();
    }

    const coords = this.mapaService.extraerCoordenadasRuta(ruta.shape);
    if (coords.length > 0) {
      this.rutaPolyline = this.mapaService.dibujarRuta(this.map, coords, '#96B4EA');
      this.map.fitBounds(this.rutaPolyline.getBounds(), { padding: [40, 40] });
    }
  }

  irACamion(camion: CamionActivo) {
    if (this.map) {
      this.map.flyTo([camion.lat, camion.lng], 16, { duration: 1.2 });
    }
  }

  togglePanel() {
    this.panelAbierto.update(v => !v);
  }

  recuperarUbicacion() {
    if (!this.map) return;

    if (!navigator.geolocation) {
      this.map.flyTo([3.8801, -77.0312], 14, { duration: 1 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!this.map) return;
        const lat = coords.latitude;
        const lng = coords.longitude;

        // Fly to location
        this.map.flyTo([lat, lng], 15, { duration: 1.2 });

        // Update or draw user area circle
        if (this.userCircle) {
          this.userCircle.setLatLng([lat, lng]);
        } else {
          this.userCircle = L.circle([lat, lng], {
            radius: 350, // 350 metros de radio para privacidad
            color: '#96B4EA',
            fillColor: '#96B4EA',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '6, 8',
            interactive: false
          }).addTo(this.map);
        }
      },
      () => this.map?.flyTo([3.8801, -77.0312], 14, { duration: 1 }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  getEstadoLabel(estado: string): string {
    const map: any = { en_ruta: 'En ruta', demorado: 'Demorado', finalizado: 'Finalizado' };
    return map[estado] || estado;
  }

  setFiltro(f: 'todas'|'camiones'|'alertas') {
    this.filtroActivo.set(f);
  }

  abrirNotificaciones() {
    this.router.navigate(['/tabs/notificaciones']);
  }

  verTodasLasRutas() {
    this.router.navigate(['/tabs/rutas']);
  }
}
