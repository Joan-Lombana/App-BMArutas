import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonIcon, IonFab, IonFabButton, IonButtons, IonBackButton } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { addIcons } from 'ionicons';
import { locate, busOutline, timerOutline, location, checkmarkCircle, pauseCircle } from 'ionicons/icons';

@Component({
  selector: 'app-mi-ruta',
  templateUrl: './mi-ruta.page.html',
  styleUrls: ['./mi-ruta.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonIcon, IonFab, IonFabButton, IonButtons, IonBackButton, CommonModule, FormsModule]
})
export class MiRutaPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  map!: L.Map;
  userMarker!: L.CircleMarker;
  watchId: string | null = null;
  
  // Variables de interfaz (mocks por ahora, para el progreso y siguiente parada)
  progresoPorcentaje = 35;
  siguienteParada = 'Cra 15 #42-18 (Barrio San José)';

  // Mock ruta de BMA (ejemplo en Barranquilla/Soledad)
  mockRouteData = [
    [10.9990, -74.8055], 
    [11.0005, -74.8080],
    [11.0020, -74.8075],
    [11.0035, -74.8060],
    [11.0050, -74.8040]  
  ] as L.LatLngTuple[];

  constructor() { 
    addIcons({ locate, busOutline, timerOutline, location, checkmarkCircle, pauseCircle });
  }

  ngOnInit() {
  }

  async ngAfterViewInit() {
    this.initMap();
    await this.setupGeolocation();
  }

  ngOnDestroy() {
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
    }
  }

  initMap() {
    // Inicializar mapa centrado en la primera coordenada simulada
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false // deshabilitamos zoom buttons para interfaz más limpia
    }).setView(this.mockRouteData[0], 15);

    // Usar layer oscuro (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(this.map);

    // Añadir polyline (la ruta programada)
    const routeLine = L.polyline(this.mockRouteData, { color: '#2ecc71', weight: 6, opacity: 0.9 }).addTo(this.map);

    // Ajustar mapa a los límites de la ruta
    this.map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

    // Marcadores de inicio y fin
    L.circleMarker(this.mockRouteData[0], { 
      radius: 10, color: '#10b981', fillColor: '#10b981', fillOpacity: 1, weight: 2 
    }).addTo(this.map).bindPopup('Punto de Inicio');
    
    L.circleMarker(this.mockRouteData[this.mockRouteData.length - 1], { 
      radius: 10, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, weight: 2 
    }).addTo(this.map).bindPopup('Punto de Fin');

    // Forzar recálculo de tamaño del mapa (necesario dentro de ion-tabs)
    setTimeout(() => { this.map.invalidateSize(); }, 300);
    setTimeout(() => { this.map.invalidateSize(); }, 800);
    setTimeout(() => { this.map.invalidateSize(); }, 1500);
  }

  async setupGeolocation() {
    try {
      // Pedir permisos
      const perms = await Geolocation.requestPermissions();
      if (perms.location !== 'granted') {
        console.error('Permisos de ubicación denegados');
        return;
      }

      // Obtener posición inicial
      const pos = await Geolocation.getCurrentPosition();
      this.updateUserMarker(pos.coords.latitude, pos.coords.longitude);

      // Iniciar watch para posición en vivo
      this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
        if (position) {
          this.updateUserMarker(position.coords.latitude, position.coords.longitude);
        }
      });
    } catch (e) {
      console.error("Error al obtener geolocalización", e);
      // Fallback a posición mockeada si estamos en un navegador que lo bloquea
      this.updateUserMarker(10.9992, -74.8058);
    }
  }

  updateUserMarker(lat: number, lng: number) {
    if (!this.map) return;
    
    if (!this.userMarker) {
      this.userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#ffffff',
        fillColor: '#3b82f6', // Azul conductor
        fillOpacity: 1,
        weight: 3
      }).addTo(this.map);
    } else {
      this.userMarker.setLatLng([lat, lng]);
    }
  }

  centerOnUser() {
    if (this.userMarker) {
      this.map.setView(this.userMarker.getLatLng(), 17, { animate: true });
    } else {
      this.map.setView(this.mockRouteData[0], 15, { animate: true });
    }
  }

  registrarParada() {
    console.log("Parada registrada");
    // Lógica para registrar parada en la BD
  }

  pausarRecorrido() {
    console.log("Recorrido pausado");
  }

  finalizarRecorte() {
    console.log("Recorrido finalizado");
  }
}
