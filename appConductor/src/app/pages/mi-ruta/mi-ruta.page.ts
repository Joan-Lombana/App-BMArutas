import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonFab, IonFabButton, IonIcon, IonModal, NavController, ToastController, ModalController } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { addIcons } from 'ionicons';
import { locate, busOutline, timerOutline, checkmarkCircle, pauseCircle, arrowBackOutline, radioOutline, mapOutline, playCircle, locationOutline, navigateOutline, stopCircleOutline } from 'ionicons/icons';
import { RutaService, Ruta } from '../../services/ruta.service';
import { Auth } from '../../services/auth';
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
  private modalCtrl = inject(ModalController);
  private auth = inject(Auth);

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

  // Datos GPS en tiempo real
  posicionActual: { lat: number; lng: number } | null = null;
  posicionesenviadas = 0;
  tiempoInicio: Date | null = null;
  tiempoTranscurrido = '00:00:00';
  private timerInterval: any = null;

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
    // El modal se abre solo cuando el mapa termina de cargar
  }

  ionViewWillLeave() {
    // Cuando navega atrás, destruimos el modal para que no se sobreponga
    this.modalAbierto = false;
  }

  async ngAfterViewInit() {
    const MIN_LOADING_MS = 4000; // Mínimo tiempo que se ve el globo
    const inicio = Date.now();

    this.rutaService.obtenerRecorridoAsignado().subscribe({
      next: (resultado) => {
        if (resultado) {
          this.recorridoIdActual = resultado.recorrido?.id ?? null;
          this.rutaCargada = resultado.ruta ?? null;
          console.log('✅ Recorrido asignado:', this.recorridoIdActual, '| Ruta:', this.rutaCargada?.nombre_ruta);
        } else {
          console.warn('⚠️ No hay recorrido asignado a este conductor.');
          this.rutaCargada = null;
        }

        // Esperar el tiempo mínimo antes de ocultar el globo
        const elapsed = Date.now() - inicio;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        setTimeout(() => {
          this.cargandoRuta = false;
          this.initMap();
          this.setupGeolocation();
          // Abrir el sheet solo cuando el mapa ya está listo
          this.modalAbierto = true;
          setTimeout(() => this.ionModal?.setCurrentBreakpoint(0.15), 3200);
        }, remaining);
      },
      error: () => {
        this.rutaCargada = null;
        this.cargandoRuta = false;
        this.modalAbierto = true;
        this.initMap();
        this.setupGeolocation();
        setTimeout(() => this.ionModal?.setCurrentBreakpoint(0.15), 1200);
      }
    });
  }

  ngOnDestroy() {
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
              if (this.recorridoIdActual) {
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

  // Actualiza la posición del marcador en el mapa
  actualizarMarcadorConductor(lat: number, lng: number) {
    if (!this.map) return;

    if (!this.conductorMarker) {
      this.conductorMarker = L.marker([lat, lng], { icon: conductorIcon, zIndexOffset: 1000 })
        .addTo(this.map)
        .bindPopup('📍 Tu posición actual');
    } else {
      this.conductorMarker.setLatLng([lat, lng]);
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
    } else if (this.routePolyline) {
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });
    }
  }

  async toggleRecorrido() {
    this.recorridoActivo = !this.recorridoActivo;

    if (this.recorridoActivo) {
      if (this.recorridoIdActual) {
        this.rutaService.iniciarRecorrido(this.recorridoIdActual).subscribe({
          next: () => {
            console.log('▶️ Recorrido iniciado en backend:', this.recorridoIdActual);
            this.mostrarToast('Recorrido iniciado. Transmitiendo ubicación en tiempo real.');
          },
          error: (err) => {
            console.warn('⚠️ Aviso al iniciar:', err?.error?.message || err.message);
            this.mostrarToast('Transmitiendo ubicación.');
          }
        });
        // Iniciar contador de tiempo
        this.tiempoInicio = new Date();
        this.posicionesenviadas = 0;
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
      if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
      this.mostrarToast('Transmisión pausada.');
    }
  }

  async confirmarFinalizar() {
    if (!this.recorridoIdActual) return;

    // Detener GPS y timer
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.recorridoActivo = false;

    this.rutaService.finalizarRecorrido(this.recorridoIdActual).subscribe({
      next: () => {
        console.log('✅ Recorrido finalizado:', this.recorridoIdActual);
        this.mostrarToast('Recorrido finalizado exitosamente.');
        this.recorridoIdActual = null; // Deshabilitar botones
      },
      error: (err) => {
        console.warn('⚠️ Error al finalizar (puede que el backend no lo soporte aun):', err?.error?.message || err.message);
        this.mostrarToast('Recorrido marcado como finalizado localmente.');
      }
    });
  }
}
