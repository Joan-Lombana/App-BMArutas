import {
  Component, OnInit, ElementRef, ViewChild,
  AfterViewInit, OnDestroy, DestroyRef, signal, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonFab, IonFabButton, IonIcon,
  NavController, ToastController, AlertController, Platform
} from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { addIcons } from 'ionicons';
import {
  locate, busOutline, timerOutline, checkmarkCircle, pauseCircle,
  arrowBackOutline, radioOutline, mapOutline, playCircle,
  locationOutline, navigateOutline, stopCircleOutline, cameraOutline
} from 'ionicons/icons';
import { RutaService, Ruta } from '../../services/ruta.service';
import { Auth } from '../../services/auth';
import { WebSocketService } from '../../services/websocket.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OfflineService } from '../../services/offline.service';

const conductorIcon = L.divIcon({
  html: `
    <div class="location-marker-wrapper">
      <div class="location-cone"></div>
      <div class="location-dot"></div>
      <div class="location-pulse"></div>
    </div>
  `,
  className: 'conductor-marker',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

interface Parada {
  coords: [number, number];
  nombre: string;
  barrio: string;
}

@Component({
  selector: 'app-mi-ruta',
  templateUrl: './mi-ruta.page.html',
  styleUrls: ['./mi-ruta.page.scss'],
  standalone: true,
  imports: [IonContent, IonFab, IonFabButton, IonIcon, CommonModule, FormsModule]
})
export class MiRutaPage implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  private rutaService = inject(RutaService);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private auth = inject(Auth);
  private ws = inject(WebSocketService);
  private destroyRef = inject(DestroyRef);
  private platform = inject(Platform);
  private offlineService = inject(OfflineService);

  private backButtonSubscription?: any;

  map!: L.Map;
  conductorMarker!: L.Marker;
  routePolyline!: L.Polyline;
  watchId: string | null = null;
  rutaCargada: Ruta | null = null;

  panelAbierto = signal(true);
  cargandoRuta = true;
  recorridoActivo = false;
  recorridoIdActual: string | null = null;

  inicioRutaLatLng: L.LatLng | null = null;
  rutaHaciaInicio: L.Polyline | null = null;
  distanciaAlInicio = 0;
  private ultimaActualizacionRutaHaciaInicio = 0;

  posicionActual: { lat: number; lng: number } | null = null;
  posicionesenviadas = 0;
  tiempoInicio: Date | null = null;
  tiempoAcumulado = 0;
  tiempoTranscurrido = '00:00:00';
  private timerInterval: any = null;
  private ultimaPosicionActualizada: { lat: number; lng: number } | null = null;
  private ultimaPosicionEnviada: { lat: number; lng: number; ts: number } | null = null;
  private readonly GPS_MIN_METROS = 5;
  private readonly GPS_MAX_ACCURACY_M = 30;

  tomandoFoto = false;
  ultimaPosicionId: string | null = null;

  // FIX #5: Flag para evitar doble carga al entrar por primera vez
  private rutaYaCargada = false;

  constructor() {
    addIcons({
      locate, busOutline, timerOutline, checkmarkCircle, pauseCircle,
      arrowBackOutline, radioOutline, mapOutline, playCircle,
      locationOutline, navigateOutline, stopCircleOutline, cameraOutline
    });
  }

  ngOnInit() {
    const conductorId = this.auth.currentUser()?.id;
    if (conductorId) {
      this.ws.unirseConductor(conductorId);
    }

    this.ws.onRecorridoAsignado()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cargarRecorridoAsignado();
      });
  }

  ionViewWillEnter() {
    // FIX #5: La primera carga la hace ngAfterViewInit, aquí solo recargamos en visitas posteriores
    if (!this.rutaYaCargada) return;
    this.cargarRecorridoAsignado();
  }

  ionViewDidEnter() {
    this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(10, () => {
      this.goBack();
    });
    if (this.map) {
      setTimeout(() => this.map?.invalidateSize(), 150);
    }
  }

  ionViewWillLeave() {
    if (this.backButtonSubscription) {
      this.backButtonSubscription.unsubscribe();
    }
    this.panelAbierto.set(false);

    // FIX #6: Pausar el timer al salir para no consumir CPU innecesariamente
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      // Guardar acumulado para reanudar correctamente al volver
      if (this.tiempoInicio) {
        this.tiempoAcumulado = Date.now() - this.tiempoInicio.getTime();
        this.tiempoInicio = null;
      }
    }
  }

  ionViewDidEnterAfterLeave() {
    // Reanudar timer si el recorrido seguía activo al volver
    if (this.recorridoActivo && !this.timerInterval) {
      this.tiempoInicio = new Date(Date.now() - this.tiempoAcumulado);
      this.iniciarTimer();
    }
  }

  async ngAfterViewInit() {
    const MIN_LOADING_MS = 1000;
    const inicio = Date.now();

    // FIX #5: Marcar que la primera carga ya ocurrió aquí
    this.rutaYaCargada = true;

    this.cargarRecorridoAsignado(() => {
      const elapsed = Date.now() - inicio;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

      setTimeout(() => {
        this.cargandoRuta = false;
        if (!this.map) this.initMap();
        if (!this.watchId) this.setupGeolocation();
        this.panelAbierto.set(true);
      }, remaining);

    }, () => {
      this.cargandoRuta = false;
      if (!this.map) this.initMap();
      if (!this.watchId) this.setupGeolocation();
      this.panelAbierto.set(true);
    });
  }

  private cargarRecorridoAsignado(onSuccess?: () => void, onError?: () => void) {
    this.rutaService.obtenerRecorridoAsignado().subscribe({
      next: (resultado) => {
        const recorridoAnterior = this.recorridoIdActual;

        if (resultado) {
          const nuevoId = resultado.recorrido?.id ?? null;

          if (recorridoAnterior && recorridoAnterior !== nuevoId) {
            this.ws.salirRecorrido(recorridoAnterior);
          }
          if (nuevoId && nuevoId !== recorridoAnterior) {
            this.ws.unirseRecorrido(nuevoId);
          }

          this.recorridoIdActual = nuevoId;
          this.rutaCargada = resultado.ruta ?? null;
          this.recorridoActivo = resultado.recorrido?.estado === 'Activa';

          if (this.recorridoActivo || resultado.recorrido?.estado === 'Pausado') {
            if (!this.tiempoInicio) this.tiempoInicio = new Date();
          }
        } else {
          if (recorridoAnterior) {
            this.ws.salirRecorrido(recorridoAnterior);
          }
          this.recorridoIdActual = null;
          this.rutaCargada = null;
        }

        onSuccess?.();
      },
      error: () => {
        this.recorridoIdActual = null;
        this.rutaCargada = null;
        onError?.();
      }
    });
  }

  ngOnDestroy() {
    if (this.backButtonSubscription) {
      this.backButtonSubscription.unsubscribe();
    }
    const conductorId = this.auth.currentUser()?.id;
    if (conductorId) this.ws.salirConductor(conductorId);
    if (this.recorridoIdActual) this.ws.salirRecorrido(this.recorridoIdActual);
    if (this.watchId) Geolocation.clearWatch({ id: this.watchId });
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.map) this.map.remove();
  }

  initMap() {
    const centerFallback: [number, number] = [3.8801, -77.0312];

    if (this.rutaCargada?.shape && typeof this.rutaCargada.shape === 'string') {
      try {
        (this.rutaCargada as any).shape = JSON.parse(this.rutaCargada.shape as any);
      } catch (e) {
        (this.rutaCargada as any).shape = null;
      }
    }

    let rawCoords: number[][] = [];
    const shape = this.rutaCargada?.shape as any;
    if (shape?.type === 'LineString' && Array.isArray(shape.coordinates)) {
      rawCoords = shape.coordinates;
    } else if (shape?.type === 'MultiLineString' && Array.isArray(shape.coordinates)) {
      rawCoords = shape.coordinates.flat();
    } else if (Array.isArray(shape?.coordinates)) {
      rawCoords = shape.coordinates;
    }

    const tieneShape = rawCoords.length > 0;
    const leafletCoords = tieneShape ? this.rutaService.geoJsonALeaflet(rawCoords) : [];
    const center: [number, number] = tieneShape ? leafletCoords[0] : centerFallback;

    if (tieneShape) {
      this.inicioRutaLatLng = L.latLng(leafletCoords[0][0], leafletCoords[0][1]);
    }

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      tap: false
    } as any).setView(center, 15);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19
    }).addTo(this.map);

    if (!tieneShape) {
      [300, 800, 1500].forEach(ms => setTimeout(() => this.map?.invalidateSize(), ms));
      return;
    }

    this.routePolyline = L.polyline(leafletCoords, {
      color: '#96B4EA',
      weight: 5,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(this.map);

    this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });

    L.circleMarker(leafletCoords[0], {
      radius: 10, color: '#10b981', fillColor: '#10b981', fillOpacity: 1, weight: 3
    }).addTo(this.map)
      .bindPopup(`<b>Inicio</b><br>${this.rutaCargada?.nombre_ruta ?? ''}`);

    const fin = leafletCoords[leafletCoords.length - 1];
    L.circleMarker(fin, {
      radius: 10, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, weight: 3
    }).addTo(this.map)
      .bindPopup('<b>Fin de ruta</b>');

    setTimeout(() => this.map?.invalidateSize(), 300);
    setTimeout(() => {
      if (this.routePolyline) {
        this.map.fitBounds(this.routePolyline.getBounds(), {
          padding: [60, 60], animate: true, duration: 1.2
        });
      }
    }, 500);
    setTimeout(() => {
      this.map.flyTo(leafletCoords[0], 16, { animate: true, duration: 1.8, easeLinearity: 0.3 });
    }, 2200);
  }

  private distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private debeAceptarLecturaGps(
    lat: number, lng: number,
    accuracy: number | null | undefined,
    ts: number
  ): boolean {
    if (accuracy != null && accuracy > this.GPS_MAX_ACCURACY_M) return false;
    const ref = this.ultimaPosicionEnviada;
    if (!ref) return true;
    return this.distanciaMetros(lat, lng, ref.lat, ref.lng) >= this.GPS_MIN_METROS;
  }

  private procesarLecturaGps(
    lat: number, lng: number,
    accuracy: number | null | undefined,
    ts: number,
    enviarAlServidor: boolean
  ) {
    if (!this.debeAceptarLecturaGps(lat, lng, accuracy, ts)) return;

    this.ultimaPosicionActualizada = { lat, lng };
    this.posicionActual = { lat, lng };
    this.actualizarMarcadorConductor(lat, lng);

    if (!enviarAlServidor || !this.recorridoActivo || !this.recorridoIdActual) return;

    let debeEnviar = false;
    if (!this.ultimaPosicionEnviada) {
      debeEnviar = true;
    } else {
      const distancia = this.distanciaMetros(lat, lng, this.ultimaPosicionEnviada.lat, this.ultimaPosicionEnviada.lng);
      debeEnviar = distancia >= this.GPS_MIN_METROS;
    }

    if (!debeEnviar) return;

    // Guardar posición anterior para revertir si falla el HTTP
    const posicionAnterior = this.ultimaPosicionEnviada;
    this.ultimaPosicionEnviada = { lat, lng, ts };

    // FIX: Emitir por WebSocket inmediatamente (tiempo real)
    this.ws.emitirPosicion({
      id: crypto.randomUUID(),
      recorridoId: this.recorridoIdActual,
      latitud: lat,
      longitud: lng,
      timestamp: ts,
      velocidad: 0,
    });

    // Enviar por HTTP (persistencia en BD)
    this.rutaService.enviarPosicion(this.recorridoIdActual, lat, lng).subscribe({
      next: () => {
        this.posicionesenviadas++;
      },
      error: (err) => {
        console.error('⚠️ Error enviando posición', err);
        // Revertir el filtro para que la próxima lectura reintente
        if (this.ultimaPosicionEnviada?.ts === ts) {
          this.ultimaPosicionEnviada = posicionAnterior;
        }
        // ✅ Guardar en cola offline para no perder la posición
        if (this.recorridoIdActual) {
          this.offlineService.guardarPosicionPendiente(
            this.recorridoIdActual, lat, lng
          );
        }
      }
    });
  }

  async setupGeolocation() {
    try {
      let perms = await Geolocation.checkPermissions();
      if (perms.location !== 'granted') {
        perms = await Geolocation.requestPermissions();
      }

      if (perms.location !== 'granted') {
        const alertPermisos = await this.alertCtrl.create({
          header: 'Permiso de ubicación requerido',
          message: 'BMArutas necesita acceso a tu ubicación en tiempo real para rastrear la ruta.',
          buttons: ['Entendido'],
          mode: 'ios'
        });
        await alertPermisos.present();
        this.usarPosicionFallback();
        return;
      }

      let pos;
      try {
        pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      } catch (err: any) {
        const alertGps = await this.alertCtrl.create({
          header: 'Ubicación desactivada',
          message: 'No pudimos acceder al GPS. Asegúrate de tener encendido el servicio de ubicación.',
          buttons: ['Entendido'],
          mode: 'ios'
        });
        await alertGps.present();
        this.usarPosicionFallback();
        return;
      }

      const lat0 = pos.coords.latitude;
      const lng0 = pos.coords.longitude;
      this.ultimaPosicionActualizada = { lat: lat0, lng: lng0 };
      this.posicionActual = { lat: lat0, lng: lng0 };
      this.actualizarMarcadorConductor(lat0, lng0);

      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 },
        (position, err) => {
          if (err || !position) return;
          this.procesarLecturaGps(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
            position.timestamp || Date.now(),
            true
          );
        }
      );
    } catch (e) {
      const alertError = await this.alertCtrl.create({
        header: 'Error de ubicación',
        message: 'Ocurrió un error inesperado al intentar acceder al GPS.',
        buttons: ['Entendido'],
        mode: 'ios'
      });
      await alertError.present();
      this.usarPosicionFallback();
    }
  }

  actualizarMarcadorConductor(lat: number, lng: number) {
    if (!this.map) return;
    const currentLatLng = L.latLng(lat, lng);

    if (!this.conductorMarker) {
      this.conductorMarker = L.marker(currentLatLng, { icon: conductorIcon, zIndexOffset: 1000 })
        .addTo(this.map)
        .bindPopup('📍 Tu posición actual');
    } else {
      this.conductorMarker.setLatLng(currentLatLng);
    }

    if (this.inicioRutaLatLng && !this.recorridoActivo) {
      this.distanciaAlInicio = currentLatLng.distanceTo(this.inicioRutaLatLng);
      if (this.distanciaAlInicio > 80) {
        this.trazarRutaHaciaInicio(currentLatLng, this.inicioRutaLatLng);
      } else {
        if (this.rutaHaciaInicio) {
          this.rutaHaciaInicio.remove();
          this.rutaHaciaInicio = null;
          this.mostrarToast('¡Estás en la zona de inicio de tu ruta!');
        }
      }
    } else if (this.recorridoActivo && this.rutaHaciaInicio) {
      this.rutaHaciaInicio.remove();
      this.rutaHaciaInicio = null;
    }
  }

  async trazarRutaHaciaInicio(origen: L.LatLng, destino: L.LatLng) {
    if (!this.map) return;
    const ahora = Date.now();
    if (this.rutaHaciaInicio && (ahora - this.ultimaActualizacionRutaHaciaInicio < 15000)) return;
    this.ultimaActualizacionRutaHaciaInicio = ahora;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const coords = data.routes[0].geometry.coordinates;
        const leafletCoords = coords.map((c: number[]) => [c[1], c[0]] as [number, number]);
        if (this.rutaHaciaInicio) {
          this.rutaHaciaInicio.setLatLngs(leafletCoords);
        } else {
          this.rutaHaciaInicio = L.polyline(leafletCoords, {
            color: '#6366f1', weight: 5, dashArray: '10, 10', opacity: 0.9, lineJoin: 'round'
          }).addTo(this.map);
          this.rutaHaciaInicio.bindPopup('Camino hacia el inicio de la ruta');
        }
      }
    } catch (e) {
      if (!this.rutaHaciaInicio) {
        this.rutaHaciaInicio = L.polyline([origen, destino], {
          color: '#6366f1', weight: 5, dashArray: '10, 10', opacity: 0.8
        }).addTo(this.map);
      } else {
        this.rutaHaciaInicio.setLatLngs([origen, destino]);
      }
    }
  }

  usarPosicionFallback() {
    this.actualizarMarcadorConductor(3.8801, -77.0312);
  }

  async mostrarToast(mensaje: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje, duration: 3000, position: 'top', color: 'dark'
    });
    await toast.present();
  }

  goBack() { this.navCtrl.back(); }
  togglePanel() { this.panelAbierto.update(v => !v); }

  centrarEnConductor() {
    if (this.conductorMarker) {
      this.map.setView(this.conductorMarker.getLatLng(), 17, { animate: true });
      const pos = this.conductorMarker.getLatLng();
      this.posicionActual = { lat: pos.lat, lng: pos.lng };
      if (this.recorridoActivo) {
        this.emitirPosicionActual(pos.lat, pos.lng);
      }
    } else if (this.routePolyline) {
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });
    }
  }

  private emitirPosicionActual(lat: number, lng: number, forzar = false) {
    if (!this.recorridoIdActual) return;

    const ts = Date.now();
    if (!forzar && !this.debeAceptarLecturaGps(lat, lng, null, ts)) return;

    const posicionAnterior = this.ultimaPosicionEnviada;
    this.ultimaPosicionEnviada = { lat, lng, ts };

    // FIX: WebSocket también en el botón MI POSICIÓN
    this.ws.emitirPosicion({
      id: crypto.randomUUID(),
      recorridoId: this.recorridoIdActual,
      latitud: lat,
      longitud: lng,
      timestamp: ts,
      velocidad: 0,
    });

    this.rutaService.enviarPosicion(this.recorridoIdActual, lat, lng).subscribe({
      next: () => { this.posicionesenviadas++; },
      error: (err) => {
      if (this.ultimaPosicionEnviada?.ts === ts) {
        this.ultimaPosicionEnviada = posicionAnterior;
      }
      },
        });
  }

  // FIX #6: Timer extraído a método reutilizable
  private iniciarTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.tiempoInicio) return;
      const diff = Date.now() - this.tiempoInicio.getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      this.tiempoTranscurrido = `${h}:${m}:${s}`;
    }, 1000);
  }

  async toggleRecorrido() {
    this.recorridoActivo = !this.recorridoActivo;

    if (this.recorridoActivo) {
      if (this.recorridoIdActual) {
        this.rutaService.iniciarRecorrido(this.recorridoIdActual).subscribe({
          next: () => {
            if (this.posicionActual) {
              this.emitirPosicionActual(this.posicionActual.lat, this.posicionActual.lng, true);
            }
            this.mostrarToast('🚀 ¡Recorrido en marcha! Transmitiendo tu ubicación en tiempo real.');
          },
          error: (err) => {
            console.warn('⚠️ Aviso al iniciar:', err?.error?.message || err.message);
            this.mostrarToast('📡 Transmisión de ubicación activada.');
          }
        });

        if (!this.tiempoInicio || this.tiempoAcumulado === 0) {
          this.tiempoInicio = new Date();
          this.posicionesenviadas = 0;
        } else {
          this.tiempoInicio = new Date(Date.now() - this.tiempoAcumulado);
        }

        this.iniciarTimer(); // FIX: usar método centralizado

      } else {
        this.mostrarToast('No tienes un recorrido asignado. Contacta al administrador.');
        this.recorridoActivo = false;
      }
    } else {
      // Pausar
      if (this.tiempoInicio) {
        this.tiempoAcumulado = Date.now() - this.tiempoInicio.getTime();
      }
      if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }

      if (this.recorridoIdActual) {
        this.rutaService.pausarRecorrido(this.recorridoIdActual).subscribe({
          next: () => console.log('⏸️ Recorrido pausado en backend'),
          error: (err) => console.warn('⚠️ Error al pausar en backend', err)
        });
      }

      this.mostrarToast('⏸️ Transmisión pausada. Tu ubicación ya no se compartirá.');
    }
  }

  async confirmarFinalizar() {
    if (!this.recorridoIdActual) return;

    const alert = await this.alertCtrl.create({
      header: '🏁 ¿Finalizar Recorrido?',
      message: '¿Estás seguro de que deseas terminar tu turno en esta ruta?',
      cssClass: 'confirm-alert',
      buttons: [
        { text: 'No, continuar', role: 'cancel', cssClass: 'alert-btn-cancel' },
        {
          text: 'Sí, finalizar',
          cssClass: 'alert-btn-confirm',
          handler: () => {
            if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
            this.recorridoActivo = false;

            this.rutaService.finalizarRecorrido(this.recorridoIdActual!).subscribe({
              next: () => {
                this.mostrarToast('✅ ¡Recorrido finalizado con éxito! Buen trabajo.');
                this.recorridoIdActual = null;
                this.tiempoInicio = null;
                this.tiempoAcumulado = 0;
                this.tiempoTranscurrido = '00:00:00';
                this.posicionesenviadas = 0;
              },
              error: (err) => {
                console.warn('Error al finalizar:', err?.error?.message || err.message);
                this.mostrarToast('🏁 Recorrido finalizado de forma local.');
                this.tiempoInicio = null;
                this.tiempoAcumulado = 0;
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  async tomarFoto() {
    if (!this.recorridoIdActual) {
      this.mostrarToast('⚠️ Debes iniciar el recorrido antes de tomar una foto.');
      return;
    }
    if (!this.posicionActual) {
      this.mostrarToast('📡 Esperando señal GPS estable para registrar el punto de la foto...');
      return;
    }

    this.tomandoFoto = true;

    try {
      const respPosicion: any = await new Promise((resolve, reject) => {
        this.rutaService.enviarPosicion(
          this.recorridoIdActual!,
          this.posicionActual!.lat,
          this.posicionActual!.lng
        ).subscribe({ next: resolve, error: reject });
      });

      const posicionId: string | null = respPosicion?.id ?? respPosicion?.posicion_id ?? null;

      if (!posicionId) {
        this.mostrarToast('⚠️ No se pudo registrar la posición en el mapa. Intenta de nuevo.');
        this.tomandoFoto = false;
        return;
      }

      this.ultimaPosicionId = posicionId;

      const foto = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        width: 512,
        height: 512,
      });

      if (!foto.base64String) {
        this.mostrarToast('⚠️ La foto no se guardó correctamente. Vuelve a intentarlo.');
        this.tomandoFoto = false;
        return;
      }

      const imagenBase64 = `data:image/jpeg;base64,${foto.base64String}`;

      this.rutaService.subirFotoPosicion(posicionId, imagenBase64).subscribe({
        next: (resp) => {
          if (resp?.status === 'success') {
            this.mostrarToast('📸 ¡Foto vinculada con éxito al reporte de ruta!');
          } else {
            this.mostrarToast('⚠️ No se recibió confirmación del servidor al subir la foto.');
          }
          this.tomandoFoto = false;
        },
        error: (err) => {
          console.error('❌ Error al subir foto:', err);
          this.mostrarToast('❌ Error de conexión al subir la foto. Verifica tu red e intenta de nuevo.');
          this.tomandoFoto = false;
        }
      });

    } catch (e: any) {
      if (e?.message !== 'User cancelled photos app') {
        console.error('Error abriendo cámara:', e);
        this.mostrarToast('📷 No se pudo acceder a la cámara.');
      }
      this.tomandoFoto = false;
    }
  }
}

