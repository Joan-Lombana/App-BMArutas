import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonFab, IonFabButton, IonIcon, IonModal, NavController, ToastController, AlertController } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { addIcons } from 'ionicons';
import { locate, busOutline, timerOutline, checkmarkCircle, pauseCircle, arrowBackOutline, radioOutline, mapOutline, playCircle, locationOutline, navigateOutline, stopCircleOutline } from 'ionicons/icons';
import { RutaService, Ruta } from '../../services/ruta.service';
import { Auth } from '../../services/auth';
import { WebSocketService } from '../../services/websocket.service';
import { inject } from '@angular/core';

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
  imports: [IonContent, IonFab, IonFabButton, IonIcon, IonModal, CommonModule, FormsModule]
})
export class MiRutaPage implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  @ViewChild(IonModal) ionModal!: IonModal;

  private rutaService = inject(RutaService);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private auth = inject(Auth);
  private ws = inject(WebSocketService);

  // Estado del mapa
  map!: L.Map;
  conductorMarker!: L.Marker;
  routePolyline!: L.Polyline;
  watchId: string | null = null;
  rutaCargada: Ruta | null = null;

  // Estado de la UI y tracking
  modalAbierto = false;
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

  // Lista de paradas fijas (temporal)
  paradaEjemplo: Parada[] = [
    { coords: [3.8855, -77.0270], nombre: 'Punto de Inicio', barrio: 'El Centro' },
    { coords: [3.8810, -77.0295], nombre: 'Parada 2', barrio: 'Barrio Obrero' },
    { coords: [3.8765, -77.0335], nombre: 'Parada 3', barrio: 'Alfonso López' },
    { coords: [3.8720, -77.0380], nombre: 'Punto Final', barrio: 'El Porvenir' },
  ];

  constructor() {
    addIcons({ locate, busOutline, timerOutline, checkmarkCircle, pauseCircle, arrowBackOutline, radioOutline, mapOutline, playCircle, locationOutline, navigateOutline, stopCircleOutline });
  }

  ngOnInit() {}

  ionViewWillEnter() {
    this.cargarRecorridoAsignado();
  }

  ionViewWillLeave() {
    // Cuando navega atrás, destruimos el modal para que no se sobreponga
    this.modalAbierto = false;
  }

  async ngAfterViewInit() {
    const MIN_LOADING_MS = 4000; // Mínimo tiempo que se ve el globo
    const inicio = Date.now();

    this.cargarRecorridoAsignado(() => {
      const elapsed = Date.now() - inicio;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

      setTimeout(() => {
        this.cargandoRuta = false;
        this.initMap();
        this.setupGeolocation();
        this.modalAbierto = true;
        setTimeout(() => this.ionModal?.setCurrentBreakpoint(0.15), 3200);
      }, remaining);
    }, () => {
      this.cargandoRuta = false;
      this.modalAbierto = true;
      this.initMap();
      this.setupGeolocation();
      setTimeout(() => this.ionModal?.setCurrentBreakpoint(0.15), 1200);
    });
  }

  private cargarRecorridoAsignado(onSuccess?: () => void, onError?: () => void) {
    this.rutaService.obtenerRecorridoAsignado().subscribe({
      next: (resultado) => {
        const recorridoAnterior = this.recorridoIdActual;

        if (resultado) {
          this.recorridoIdActual = resultado.recorrido?.id ?? null;
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

    console.log('🗺 Shape recibido:', JSON.stringify(this.rutaCargada?.shape));

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
      color: '#00E5FF',
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

  // Lógica de geolocalización y seguimiento GPS
  async setupGeolocation() {
    try {
      // 1. Verificar si ya tenemos permisos antes de pedir
      let perms = await Geolocation.checkPermissions();
      
      if (perms.location !== 'granted') {
        perms = await Geolocation.requestPermissions();
      }

      if (perms.location !== 'granted') {
        this.mostrarToast('Permiso de ubicación denegado. Usando modo offline.');
        this.usarPosicionFallback();
        return;
      }

      // 2. Obtener posición inicial con Timeout para no quedarse colgado
      const pos = await Geolocation.getCurrentPosition({ 
        enableHighAccuracy: true, 
        timeout: 10000 
      });
      this.posicionActual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.actualizarMarcadorConductor(pos.coords.latitude, pos.coords.longitude);

      // 3. Seguimiento en tiempo real
      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (position, err) => {
          if (err) { console.error('Error en watchPosition:', err); return; }
          if (position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            this.posicionActual = { lat, lng }; // Guarda para mostrar en UI
            this.actualizarMarcadorConductor(lat, lng);

            if (this.recorridoActivo) {
              if (this.map) this.map.setView([lat, lng]);
              const ahora = Date.now();
              if (this.recorridoIdActual && ahora - this.ultimoEnvioPosicion >= 3000) {
                this.ultimoEnvioPosicion = ahora;
                this.rutaService.enviarPosicion(this.recorridoIdActual, lat, lng).subscribe({
                  next: () => { this.posicionesenviadas++; },
                  error: (err) => console.error('⚠️ Error enviando posición', err)
                });
              }
            }
          }
        }
      );
    } catch (e) {
      console.error('Error obteniendo ubicación inicial:', e);
      this.mostrarToast('No se pudo obtener el GPS. Asegúrate de tener la ubicación encendida.');
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

  // Acciones y controles de la interfaz
  async goBack() {
    // 1. Liberamos el bloqueo anti-cierre del modal
    this.ionModal.canDismiss = true;
    
    // 2. Cerramos el modal de forma nativa y esperamos a que desaparezca por completo del DOM
    await this.ionModal.dismiss();
    
    // 3. Una vez limpio, regresamos a la pantalla anterior sin dejar "zombis"
    this.navCtrl.back();
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

  private emitirPosicionActual(lat: number, lng: number) {
    if (!this.recorridoIdActual) return;

    this.ultimoEnvioPosicion = Date.now();

    this.rutaService.enviarPosicion(this.recorridoIdActual, lat, lng).subscribe({
      next: () => { this.posicionesenviadas++; },
      error: (err) => console.error('⚠️ Error enviando posición', err)
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
              this.emitirPosicionActual(this.posicionActual.lat, this.posicionActual.lng);
            }
            this.mostrarToast('Recorrido iniciado. Transmitiendo ubicación en tiempo real.');
          },
          error: (err) => {
            console.warn('⚠️ Aviso al iniciar:', err?.error?.message || err.message);
            this.mostrarToast('Transmitiendo ubicación.');
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

      this.mostrarToast('Transmisión pausada.');
    }
  }

  async confirmarFinalizar() {
    if (!this.recorridoIdActual) return;

    const alert = await this.alertCtrl.create({
      header: 'Finalizar Recorrido',
      message: '¿Estás seguro de que deseas finalizar el recorrido? Esta acción no se puede deshacer.',
      cssClass: 'confirm-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'alert-btn-cancel'
        },
        {
          text: 'Finalizar',
          cssClass: 'alert-btn-confirm',
          handler: () => {
            if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
            this.recorridoActivo = false;

            this.rutaService.finalizarRecorrido(this.recorridoIdActual!).subscribe({
              next: () => {
                console.log('Recorrido finalizado:', this.recorridoIdActual);
                this.mostrarToast('Recorrido finalizado exitosamente.');
                this.recorridoIdActual = null;
                this.tiempoInicio = null;
                this.tiempoAcumulado = 0;
                this.tiempoTranscurrido = '00:00:00';
                this.posicionesenviadas = 0;
              },
              error: (err) => {
                console.warn('Error al finalizar:', err?.error?.message || err.message);
                this.mostrarToast('Recorrido marcado como finalizado localmente.');
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
}
