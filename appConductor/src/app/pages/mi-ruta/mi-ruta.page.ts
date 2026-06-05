import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy, DestroyRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonFab, IonFabButton, IonIcon, NavController, ToastController, AlertController, Platform } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { addIcons } from 'ionicons';
import { locate, busOutline, timerOutline, checkmarkCircle, pauseCircle, arrowBackOutline, radioOutline, mapOutline, playCircle, locationOutline, navigateOutline, stopCircleOutline, cameraOutline } from 'ionicons/icons';
import { RutaService, Ruta } from '../../services/ruta.service';
import { Auth } from '../../services/auth';
import { WebSocketService } from '../../services/websocket.service';
import { inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// Marcador personalizado estilo Google Maps para el conductor
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


// Estructura de las paradas de la ruta
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

  private backButtonSubscription?: any;

  // Estado del mapa
  map!: L.Map;
  conductorMarker!: L.Marker;
  routePolyline!: L.Polyline;
  watchId: string | null = null;
  rutaCargada: Ruta | null = null;

  // Estado de la UI y tracking
  panelAbierto = signal(true);
  cargandoRuta = true;
  recorridoActivo = false;
  recorridoIdActual: string | null = null;

  // Guía hacia el inicio
  inicioRutaLatLng: L.LatLng | null = null;
  rutaHaciaInicio: L.Polyline | null = null;
  distanciaAlInicio = 0;
  private ultimaActualizacionRutaHaciaInicio = 0;

  // Datos GPS en tiempo real
  posicionActual: { lat: number; lng: number } | null = null;
  posicionesenviadas = 0;
  tiempoInicio: Date | null = null;
  tiempoAcumulado = 0;
  tiempoTranscurrido = '00:00:00';
  private timerInterval: any = null;
  private ultimoEnvioPosicion = 0;
  private ultimaPosicionActualizada: { lat: number; lng: number } | null = null;
  private ultimaPosicionEnviada: { lat: number; lng: number; ts: number } | null = null;

  /** Filtros GPS: trazo continuo al caminar, sin racimos por jitter */
  private readonly GPS_MIN_METROS = 5;
  private readonly GPS_MAX_ACCURACY_M = 30;

  


  // Estado de la cámara
  tomandoFoto = false;
  ultimaPosicionId: string | null = null;

  constructor() {
    addIcons({ locate, busOutline, timerOutline, checkmarkCircle, pauseCircle, arrowBackOutline, radioOutline, mapOutline, playCircle, locationOutline, navigateOutline, stopCircleOutline, cameraOutline });
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
    this.cargarRecorridoAsignado();
  }

  ionViewDidEnter() {
    // Interceptar botón atrás físico/sistema
    this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(10, () => {
      this.goBack();
    });
    if (this.map) {
      setTimeout(() => {
        this.map?.invalidateSize();
      }, 150);
    }
  }

  ionViewWillLeave() {
    if (this.backButtonSubscription) {
      this.backButtonSubscription.unsubscribe();
    }
    this.panelAbierto.set(false);
  }

  async ngAfterViewInit() {
    const MIN_LOADING_MS = 1000; // Mínimo tiempo que se ve el globo
    const inicio = Date.now();

    this.cargarRecorridoAsignado(() => {
      const elapsed = Date.now() - inicio;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

      setTimeout(() => {
    this.cargandoRuta = false;

    if (!this.map) {
      this.initMap();
    }

    if (!this.watchId) {
      this.setupGeolocation();
    }

    this.panelAbierto.set(true);
  }, remaining);

  }, () => {
    this.cargandoRuta = false;

    if (!this.map) {
      this.initMap();
    }

    if (!this.watchId) {
      this.setupGeolocation();
    }

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
            // Si ya estaba activo o pausado, le ponemos un tiempo inicio temporal para que no desaparezca la UI
            if (!this.tiempoInicio) this.tiempoInicio = new Date();
          }

          console.log('✅ Recorrido asignado:', this.recorridoIdActual, '| Ruta:', this.rutaCargada?.nombre_ruta, '| Estado:', resultado.recorrido?.estado);
        } else {
          if (recorridoAnterior) {
            this.ws.salirRecorrido(recorridoAnterior);
          }

          this.recorridoIdActual = null;
          this.rutaCargada = null;
          console.warn('⚠️ No hay recorrido asignado a este conductor.');
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

  // Configuración e inicialización del mapa de Leaflet
  initMap() {
    const centerFallback: [number, number] = [3.8801, -77.0312];

    // Normalizar shape (puede venir como string JSON)
    if (this.rutaCargada?.shape && typeof this.rutaCargada.shape === 'string') {
      try {
        (this.rutaCargada as any).shape = JSON.parse(this.rutaCargada.shape as any);
      } catch (e) {
        console.warn('⚠️ No se pudo parsear el shape');
        (this.rutaCargada as any).shape = null;
      }
    }

    console.log(' Shape recibido:', JSON.stringify(this.rutaCargada?.shape));

    // Extraer coordenadas segun el tipo de geometria
    let rawCoords: number[][] = [];
    const shape = this.rutaCargada?.shape as any;
    if (shape?.type === 'LineString' && Array.isArray(shape.coordinates)) {
      rawCoords = shape.coordinates;
    } else if (shape?.type === 'MultiLineString' && Array.isArray(shape.coordinates)) {
      rawCoords = shape.coordinates.flat();
    } else if (Array.isArray(shape?.coordinates)) {
      rawCoords = shape.coordinates;
    }

    console.log('📍 Coordenadas extraidas:', rawCoords.length);

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
      [300, 800, 1500].forEach(ms =>
        setTimeout(() => this.map?.invalidateSize(), ms)
      );
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

    // Fly-to animado: primero muestra la ruta completa, luego vuela al inicio
    setTimeout(() => this.map?.invalidateSize(), 300);
    setTimeout(() => {
      if (this.routePolyline) {
        // Paso 1: muestra toda la ruta
        this.map.fitBounds(this.routePolyline.getBounds(), {
          padding: [60, 60],
          animate: true,
          duration: 1.2
        });
      }
    }, 500);
    setTimeout(() => {
      // Paso 2: vuela al punto de inicio con zoom más cercano
      this.map.flyTo(leafletCoords[0], 16, {
        animate: true,
        duration: 1.8,
        easeLinearity: 0.3
      });
    }, 2200);
  }

  /** Distancia Haversine en metros entre dos coordenadas */
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

  /**
   * Descarta lecturas con mala precisión, micro-movimientos o saltos imposibles (GPS jitter).
   */
  private debeAceptarLecturaGps(
  lat: number,
  lng: number,
  accuracy: number | null | undefined,
  ts: number,
): boolean {

  if (accuracy != null && accuracy > this.GPS_MAX_ACCURACY_M) {
    return false;
  }

  const ref = this.ultimaPosicionEnviada;

  if (!ref) {
    return true;
  }

  const dist = this.distanciaMetros(
    lat,
    lng,
    ref.lat,
    ref.lng
  );

  return dist >= this.GPS_MIN_METROS;
}

  private procesarLecturaGps(
  lat: number,
  lng: number,
  accuracy: number | null | undefined,
  ts: number,
  enviarAlServidor: boolean,
) {
  if (!this.debeAceptarLecturaGps(lat, lng, accuracy, ts)) {
    return;
  }

  this.ultimaPosicionActualizada = { lat, lng };
  this.posicionActual = { lat, lng };
  this.actualizarMarcadorConductor(lat, lng);

  if (!enviarAlServidor || !this.recorridoActivo || !this.recorridoIdActual) {
    return;
  }

  let debeEnviar = false;

  if (!this.ultimaPosicionEnviada) {
    debeEnviar = true;
  } else {
    const distancia = this.distanciaMetros(
      lat,
      lng,
      this.ultimaPosicionEnviada.lat,
      this.ultimaPosicionEnviada.lng
    );

    debeEnviar = distancia >= this.GPS_MIN_METROS;
  }

  if (!debeEnviar) {
    return;
  }

  this.ultimaPosicionEnviada = { lat, lng, ts };

  this.rutaService.enviarPosicion(
    this.recorridoIdActual,
    lat,
    lng
  ).subscribe({
    next: () => {
      this.posicionesenviadas++;
    },
    error: (err) => {
      console.error('⚠️ Error enviando posición', err);
    }
  });
}


  async setupGeolocation() {
    try {
      // 1. Verificar si ya tenemos permisos antes de pedir
      let perms = await Geolocation.checkPermissions();

      if (perms.location !== 'granted') {
        perms = await Geolocation.requestPermissions();
      }

      if (perms.location !== 'granted') {
        const alertPermisos = await this.alertCtrl.create({
          header: 'Permiso de ubicación requerido',
          message: 'BMArutas necesita acceso a tu ubicación en tiempo real para rastrear la ruta de recolección. Por favor, concede los permisos de ubicación en los ajustes de tu dispositivo.',
          buttons: ['Entendido'],
          mode: 'ios'
        });
        await alertPermisos.present();
        this.usarPosicionFallback();
        return;
      }

      // 2. Obtener posición inicial con Timeout para no quedarse colgado
      let pos;
      try {
        pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000
        });
      } catch (err: any) {
        console.error('Error en getCurrentPosition:', err);
        const alertGps = await this.alertCtrl.create({
          header: 'Ubicación desactivada',
          message: 'No pudimos acceder al GPS. Asegúrate de tener encendido el servicio de ubicación (GPS) en la configuración rápida de tu dispositivo.',
          buttons: ['Entendido'],
          mode: 'ios'
        });
        await alertGps.present();
        this.usarPosicionFallback();
        return;
      }

      const lat0 = pos.coords.latitude;
      const lng0 = pos.coords.longitude;
      const ts0 = pos.timestamp || Date.now();
      this.ultimaPosicionActualizada = { lat: lat0, lng: lng0 };
      this.posicionActual = { lat: lat0, lng: lng0 };
      this.actualizarMarcadorConductor(lat0, lng0);

      // 3. Seguimiento en tiempo real (con filtros anti-jitter)
      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 },
        (position, err) => {
          if (err) {
            console.error('Error en watchPosition:', err);
            return;
          }
          if (!position) {
            return;
          }

          this.procesarLecturaGps(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
            position.timestamp || Date.now(),
            true,
          );
        },
      );
    } catch (e) {
      console.error('Error obteniendo ubicación:', e);
      const alertError = await this.alertCtrl.create({
        header: 'Error de ubicación',
        message: 'Ocurrió un error inesperado al intentar acceder al GPS de tu dispositivo.',
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

    // Lógica para guiar hacia el inicio de la ruta si está lejos
    if (this.inicioRutaLatLng && !this.recorridoActivo) {
      this.distanciaAlInicio = currentLatLng.distanceTo(this.inicioRutaLatLng);

      // Si está a más de 80 metros, trazar ruta hacia el inicio
      if (this.distanciaAlInicio > 80) {
        this.trazarRutaHaciaInicio(currentLatLng, this.inicioRutaLatLng);
      } else {
        // Ya llegó al inicio
        if (this.rutaHaciaInicio) {
          this.rutaHaciaInicio.remove();
          this.rutaHaciaInicio = null;
          this.mostrarToast('¡Estás en la zona de inicio de tu ruta!');
        }
      }
    } else if (this.recorridoActivo && this.rutaHaciaInicio) {
      // Si ya inició el recorrido, quitamos la guía
      this.rutaHaciaInicio.remove();
      this.rutaHaciaInicio = null;
    }
  }

  async trazarRutaHaciaInicio(origen: L.LatLng, destino: L.LatLng) {
    if (!this.map) return;
    const ahora = Date.now();
    // Actualizar solo cada 15 segundos para no saturar OSRM
    if (this.rutaHaciaInicio && (ahora - this.ultimaActualizacionRutaHaciaInicio < 15000)) {
      return;
    }
    this.ultimaActualizacionRutaHaciaInicio = ahora;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates;
        const leafletCoords = coords.map((c: number[]) => [c[1], c[0]] as [number, number]);

        if (this.rutaHaciaInicio) {
          this.rutaHaciaInicio.setLatLngs(leafletCoords);
        } else {
          this.rutaHaciaInicio = L.polyline(leafletCoords, {
            color: '#6366f1', // Indigo
            weight: 5,
            dashArray: '10, 10', // Línea punteada
            opacity: 0.9,
            lineJoin: 'round'
          }).addTo(this.map);
          this.rutaHaciaInicio.bindPopup('Camino hacia el inicio de la ruta');
        }
      }
    } catch (e) {
      console.error('Error fetching OSRM route:', e);
      // Fallback: linea recta si falla OSRM
      if (!this.rutaHaciaInicio) {
        this.rutaHaciaInicio = L.polyline([origen, destino], {
          color: '#6366f1',
          weight: 5,
          dashArray: '10, 10',
          opacity: 0.8
        }).addTo(this.map);
      } else {
        this.rutaHaciaInicio.setLatLngs([origen, destino]);
      }
    }
  }

  // Posición de fallback
  usarPosicionFallback() {
    this.actualizarMarcadorConductor(3.8801, -77.0312);
  }

  async mostrarToast(mensaje: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 3000,
      position: 'top',
      color: 'dark'
    });
    await toast.present();
  }

  goBack() {
    this.navCtrl.back();
  }

  togglePanel() {
    this.panelAbierto.update(v => !v);
  }

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

  /** Envía posición al servidor respetando los mismos filtros GPS (salvo inicio de recorrido). */
  private emitirPosicionActual(lat: number, lng: number, forzar = false) {
    if (!this.recorridoIdActual) return;

    const ts = Date.now();
    if (!forzar && !this.debeAceptarLecturaGps(lat, lng, null, ts)) {
      return;
    }

    this.ultimoEnvioPosicion = ts;
    this.ultimaPosicionEnviada = { lat, lng, ts };

    this.rutaService.enviarPosicion(this.recorridoIdActual, lat, lng).subscribe({
      next: () => { this.posicionesenviadas++; },
      error: (err) => console.error('⚠️ Error enviando posición', err),
    });
  }

  async toggleRecorrido() {
    this.recorridoActivo = !this.recorridoActivo;

    if (this.recorridoActivo) {
      if (this.recorridoIdActual) {
        this.rutaService.iniciarRecorrido(this.recorridoIdActual).subscribe({
          next: () => {
            console.log('▶️ Recorrido iniciado en backend:', this.recorridoIdActual);
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
        // Iniciar contador de tiempo si es la primera vez o reanudar
        if (!this.tiempoInicio || this.tiempoAcumulado === 0) {
          this.tiempoInicio = new Date();
          this.posicionesenviadas = 0;
        } else {
          // Reanudar ajustando el tiempo de inicio
          this.tiempoInicio = new Date(Date.now() - this.tiempoAcumulado);
        }

        this.timerInterval = setInterval(() => {
          if (!this.tiempoInicio) return;
          const diff = Date.now() - this.tiempoInicio.getTime();
          const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
          const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
          const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
          this.tiempoTranscurrido = `${h}:${m}:${s}`;
        }, 1000);
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
      message: '¿Estás seguro de que deseas terminar tu turno en esta ruta? Se detendrá el envío de tu ubicación en tiempo real.',
      cssClass: 'confirm-alert',
      buttons: [
        {
          text: 'No, continuar',
          role: 'cancel',
          cssClass: 'alert-btn-cancel'
        },
        {
          text: 'Sí, finalizar',
          cssClass: 'alert-btn-confirm',
          handler: () => {
            if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
            this.recorridoActivo = false;

            this.rutaService.finalizarRecorrido(this.recorridoIdActual!).subscribe({
              next: () => {
                console.log('Recorrido finalizado:', this.recorridoIdActual);
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

  // ============================================================
  // TOMAR Y SUBIR FOTO (Flujo de 2 pasos según guía técnica)
  // ============================================================
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
      // 1️⃣ Registrar la posición actual en el backend y capturar el posicion_id
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

      // 2️⃣ Abrir la cámara con Capacitor Camera
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

      // 3️⃣ Subir la foto vinculada a la posición recién creada
      this.rutaService.subirFotoPosicion(posicionId, imagenBase64).subscribe({
        next: (resp) => {
          if (resp?.status === 'success') {
            console.log('📷 Foto subida exitosamente:', resp);
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
      // El usuario canceló la cámara u ocurrió un error
      if (e?.message !== 'User cancelled photos app') {
        console.error('Error abriendo cámara:', e);
        this.mostrarToast('📷 No se pudo acceder a la cámara.');
      }
      this.tomandoFoto = false;
    }
  }
}

