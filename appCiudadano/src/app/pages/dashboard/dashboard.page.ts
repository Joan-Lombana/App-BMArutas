import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonIcon, AlertController
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
import { Geolocation } from '@capacitor/geolocation';


interface CamionActivo {
  recorridoId: string;
  nombre: string;
  estado: 'en_ruta' | 'demorado' | 'finalizado';
  lat: number;
  lng: number;
  shape?: string | { type: string; coordinates: number[][] | number[][][] };
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
  private alertCtrl = inject(AlertController);

  private vehiculosMarkers = new Map<string, L.Marker>();
  private rutaPolyline?: L.Polyline;
  private recorridosUnidos = new Set<string>();
  private userCircle?: L.Circle;
  private photoMarkers: L.Marker[] = [];
  private photoMarkerIds = new Set<string>();
  private recorridosActivosList: any[] = [];
  private posicionesVehiculos = new Map<string, { lat: number, lng: number }>();

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

  ionViewDidEnter() {
    if (this.map) {
      setTimeout(() => {
        this.map?.invalidateSize();
      }, 150);
    }
    // Recargar fotos al volver al mapa (por si se tomaron mientras no estaba activo)
    if (this.recorridosActivosList.length > 0) {
      this.recorridosActivosList.forEach((recorrido) => {
        this.cargarFotosRecorrido(recorrido.id);
      });
    }
  }

  ngOnDestroy() {
    this.socket.offNuevaPosicion(this.onNuevaPosicion);
    this.socket.offLocationPhoto(this.onLivePhoto);
    this.recorridosUnidos.forEach((recorridoId) => this.socket.salirRecorrido(recorridoId));
    this.photoMarkers.forEach(m => this.map && m.remove());
    this.photoMarkers = [];
    this.photoMarkerIds.clear();
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
    this.socket.offLocationPhoto(this.onLivePhoto);
    this.socket.onLocationPhoto(this.onLivePhoto);
  }

  private actualizarMarcadorFoto(data: any) {
    if (!this.map) return;
    console.log('📷 Foto en vivo recibida en ciudadano:', data);
    this.agregarMarcadorFoto(data);
  }

  private cargarRecorridosActivos() {
    this.recorridosService.obtenerRecorridosActivos().subscribe({
      next: (recorridos) => {
        this.recorridosActivosList = recorridos;
        recorridos.forEach((recorrido) => {
          this.socket.unirseRecorrido(recorrido.id);
          this.recorridosUnidos.add(recorrido.id);

          const ruta = recorrido.ruta;
          if (ruta?.shape && this.map && !this.rutaPolyline) {
            this.mostrarRutaEnMapa({ shape: ruta.shape });
          }

          this.cargarFotosRecorrido(recorrido.id);
        });
        this.actualizarCamionesCercanos();
      },
      error: (err) => console.warn('No se pudieron cargar recorridos activos', err)
    });
  }

  private cargarFotosRecorrido(recorridoId: string) {
    this.recorridosService.obtenerFotosRecorrido(recorridoId).subscribe({
      next: (fotos) => fotos.forEach((foto) => this.agregarMarcadorFoto(foto)),
      error: (err) => console.warn('No se pudieron cargar fotos del recorrido', recorridoId, err)
    });
  }

  private agregarMarcadorFoto(data: any) {
    if (!this.map) { console.warn('📷 agregarMarcadorFoto: mapa no listo'); return; }

    console.log('📷 Procesando foto socket payload:', JSON.stringify(data));

    const posicionId = data?.posicion_id ?? data?.posicionId ?? data?.id;
    // El backend envía lat/lon (no latitud/longitud)
    const lat = Number(data?.lat ?? data?.latitud ?? data?.latitude);
    const lon = Number(data?.lon ?? data?.lng ?? data?.longitud ?? data?.longitude);

    if (!posicionId) { console.warn('📷 Sin posicion_id en payload:', data); return; }
    if (!Number.isFinite(lat)) { console.warn('📷 lat inválido:', lat, 'data:', data); return; }
    if (!Number.isFinite(lon)) { console.warn('📷 lon inválido:', lon, 'data:', data); return; }
    if (this.photoMarkerIds.has(posicionId)) { return; }

    const marker = this.mapaService.crearMarcadorFoto(
      lat,
      lon,
      posicionId,
      data.capturado_ts || data.timestamp || Date.now(),
      environment.apiUrl,
      data.imagen_url ?? data.foto_url ?? data.url ?? data.imagen
    ).addTo(this.map);

    this.photoMarkers.push(marker);
    this.photoMarkerIds.add(posicionId);
    console.log('✅ Marcador de foto añadido en:', lat, lon);
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
    }

    this.posicionesVehiculos.set(pos.recorridoId, { lat: pos.latitud, lng: pos.longitud });
    this.actualizarCamionesCercanos();
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
    if (!this.map) return;

    // Si hay shape de ruta, mostrarla y centrar en ella
    if (camion.shape) {
      const coords = this.mapaService.extraerCoordenadasRuta(camion.shape);
      if (coords.length > 0) {
        // Dibujar la ruta en el mapa
        if (this.rutaPolyline) this.rutaPolyline.remove();
        this.rutaPolyline = this.mapaService.dibujarRuta(this.map, coords, '#96B4EA');
        this.map.fitBounds(this.rutaPolyline.getBounds(), { padding: [40, 40] });
        return;
      }
    }

    // Fallback: volar al punto del vehículo si tenemos posición real
    this.map.flyTo([camion.lat, camion.lng], 16, { duration: 1.2 });
  }

  togglePanel() {
    this.panelAbierto.update(v => !v);
  }

  async recuperarUbicacion() {
    if (!this.map) return;

    try {
      // 1. Verificar y pedir permisos nativos usando Capacitor
      let perms = await Geolocation.checkPermissions();
      if (perms.location !== 'granted') {
        perms = await Geolocation.requestPermissions();
      }

      if (perms.location !== 'granted') {
        const alert = await this.alertCtrl.create({
          header: 'Permiso de ubicación requerido',
          message: 'BMArutas necesita acceso a tu ubicación para mostrarte las rutas más cercanas en tu zona. Por favor, concede los permisos en los ajustes de tu dispositivo.',
          buttons: ['Entendido'],
          mode: 'ios'
        });
        await alert.present();
        this.map.flyTo([3.8801, -77.0312], 14, { duration: 1 });
        return;
      }

      // 2. Obtener la ubicación usando el plugin nativo
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Volar al punto en el mapa
      this.map.flyTo([lat, lng], 15, { duration: 1.2 });

      // Dibujar o mover el círculo de privacidad del ciudadano
      if (this.userCircle) {
        this.userCircle.setLatLng([lat, lng]);
      } else {
        this.userCircle = L.circle([lat, lng], {
          radius: 150, // 150 metros de radio para privacidad
          color: '#96B4EA',
          fillColor: '#96B4EA',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '6, 8',
          interactive: false
        }).addTo(this.map);
      }
      this.actualizarCamionesCercanos();

    } catch (error: any) {
      console.error('Error recuperando ubicación del ciudadano:', error);
      
      let msg = 'No pudimos acceder a tu ubicación. Asegúrate de tener activado el GPS en tu dispositivo y haber concedido los permisos de ubicación a la aplicación.';
      if (error?.code === 1 || error?.message?.includes('denied')) {
        msg = 'Permiso de ubicación denegado. Para ver las rutas cercanas a ti, concede los permisos de ubicación en los ajustes de tu dispositivo.';
      } else if (error?.code === 2 || error?.message?.includes('disabled') || error?.message?.includes('settings')) {
        msg = 'El servicio de ubicación (GPS) está desactivado. Por favor actívalo en los ajustes rápidos de tu teléfono.';
      }

      const alert = await this.alertCtrl.create({
        header: 'Ubicación no disponible',
        message: msg,
        buttons: ['Entendido'],
        mode: 'ios'
      });
      await alert.present();
      
      this.map.flyTo([3.8801, -77.0312], 14, { duration: 1 });
    }
  }

  private calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // metros
  }

  private actualizarCamionesCercanos() {
    const userLatLng = this.userCircle ? this.userCircle.getLatLng() : null;
    const radioLimite = 1000; // 1 km límite para rutas/camiones en la zona del ciudadano

    const listadoCercanos: CamionActivo[] = [];

    this.recorridosActivosList.forEach(recorrido => {
      const ultimaPos = this.posicionesVehiculos.get(recorrido.id);

      // Calcular coordenadas: posición real del vehículo o centroide de la ruta
      let camionLat = 0;
      let camionLng = 0;

      if (ultimaPos) {
        camionLat = ultimaPos.lat;
        camionLng = ultimaPos.lng;
      } else if (recorrido.ruta?.shape) {
        // Calcular centroide de la ruta como fallback
        const coordsRuta = this.mapaService.extraerCoordenadasRuta(recorrido.ruta.shape);
        if (coordsRuta.length > 0) {
          const sumLat = coordsRuta.reduce((s, c) => s + c[0], 0);
          const sumLng = coordsRuta.reduce((s, c) => s + c[1], 0);
          camionLat = sumLat / coordsRuta.length;
          camionLng = sumLng / coordsRuta.length;
        }
      }

      let estaCerca = false;

      if (userLatLng) {
        // A. Si conocemos la posición del camión en tiempo real
        if (ultimaPos) {
          const distAlCamion = this.calcularDistancia(userLatLng.lat, userLatLng.lng, camionLat, camionLng);
          if (distAlCamion <= radioLimite) {
            estaCerca = true;
          }
        }

        // B. Si la ruta pasa cerca del radio del ciudadano
        if (!estaCerca && recorrido.ruta?.shape) {
          const coordsRuta = this.mapaService.extraerCoordenadasRuta(recorrido.ruta.shape);
          for (const coord of coordsRuta) {
            const distACoord = this.calcularDistancia(userLatLng.lat, userLatLng.lng, coord[0], coord[1]);
            if (distACoord <= radioLimite) {
              estaCerca = true;
              break;
            }
          }
        }
      } else {
        // Fallback: Si no hay ubicación de GPS del ciudadano, listamos todos los activos
        estaCerca = true;
      }

      if (estaCerca) {
        listadoCercanos.push({
          recorridoId: recorrido.id,
          nombre: recorrido.ruta?.nombre_ruta || `Ruta ${recorrido.id.substring(0, 4)}`,
          estado: 'en_ruta',
          lat: camionLat,
          lng: camionLng,
          shape: recorrido.ruta?.shape
        });
      }
    });

    this.camionesActivos.set(listadoCercanos);
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
