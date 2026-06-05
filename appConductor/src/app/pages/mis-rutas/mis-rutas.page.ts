import { Component, OnInit, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import { timeOutline, chevronForwardOutline, checkmarkCircle, playCircle, cloudOfflineOutline, notificationsOutline, mapOutline, chevronBackOutline } from 'ionicons/icons';
import { RutaService } from '../../services/ruta.service';
import { OfflineService } from '../../services/offline.service';

// Estructura de datos que vendrá del backend
export interface Ruta {
  codigo: string;           // Ej: RT-4029
  zona: string;             // Ej: Centro Norte - Sector A
  horarioInicio: string;    // Ej: 06:00
  horarioFin: string;       // Ej: 14:00
  estado: 'asignada' | 'activa' | 'finalizada';
}

// Resumen de la jornada del conductor (datos del backend)
export interface ResumenJornada {
  porcentajeCompletado: number;
  kmsRecorridos: number;
  puntosRestantes: number;
}

@Component({
  selector: 'app-mis-rutas',
  templateUrl: './mis-rutas.page.html',
  styleUrls: ['./mis-rutas.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, FormsModule, RouterModule]
})
export class MisRutasPage implements OnInit {

  // Nombre del conductor — vendrá del servicio de autenticación
  conductorNombre: string = '';

  // ✨ Fecha seleccionada para historial
  fechaSeleccionada: Date = new Date();
  fechaFormateada: string = '';

  // Estructura de la ruta a mostrar (solo completadas)
  rutas: any[] = [];
  cargando = true;
  resumenJornada: any = null; // Por ahora sin datos del backend
  private rutaService = inject(RutaService);
  public offlineService = inject(OfflineService); // ✅ Accesible desde el HTML

  constructor() {
    addIcons({ timeOutline, chevronForwardOutline, checkmarkCircle, playCircle, cloudOfflineOutline, notificationsOutline, mapOutline, chevronBackOutline });
  }

  ngOnInit() {
    this.actualizarFechaFormateada();
    this.cargarHistorial();
  }

  ionViewWillEnter() {
    this.cargarHistorial();
  }

  // ✨ Cargar historial de rutas completadas para una fecha específica
  cargarHistorial() {
    this.cargando = true;
    // Por ahora, obteneremos todas las rutas pero filtraremos solo las finalizadas
    this.rutaService.obtenerTodosLosRecorridosAsignados().subscribe({
      next: (resultados) => {
        this.rutas = resultados
          .filter(({ recorrido }) => recorrido?.estado === 'Finalizado') // ✨ Solo completadas
          .map(({ recorrido, ruta }) => ({
            codigo: ruta?.nombre_ruta || 'Sin código',
            zona: 'Buenaventura',
            horarioInicio: '06:00',
            horarioFin: '14:00',
            estado: this.mapearEstado(recorrido?.estado),
            fechaCompletada: recorrido?.fecha_finalizacion || new Date(),
            _ruta: ruta,
            _recorrido: recorrido
          }));
        this.cargando = false;
      },
      error: () => {
        this.rutas = [];
        this.cargando = false;
      }
    });
  }

  // ✨ Cambiar fecha anterior
  irFechaAnterior() {
    this.fechaSeleccionada.setDate(this.fechaSeleccionada.getDate() - 1);
    this.actualizarFechaFormateada();
    this.cargarHistorial();
  }

  // ✨ Cambiar fecha siguiente
  irFechaSiguiente() {
    const hoy = new Date();
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);
    
    // No permitir ir más allá de hoy
    if (this.fechaSeleccionada.toDateString() !== hoy.toDateString()) {
      this.fechaSeleccionada.setDate(this.fechaSeleccionada.getDate() + 1);
      this.actualizarFechaFormateada();
      this.cargarHistorial();
    }
  }

  // ✨ Actualizar la fecha formateada para mostrar
  actualizarFechaFormateada() {
    const opciones: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    };
    this.fechaFormateada = this.fechaSeleccionada.toLocaleDateString('es-CO', opciones);
  }

  mapearEstado(estadoBackend: string): string {
    switch (estadoBackend) {
      case 'Activa': return 'activa';
      case 'Programada': return 'asignada';
      case 'Finalizado': return 'finalizada';
      default: return 'asignada';
    }
  }

  // Estado del badge de una ruta
  getEstadoLabel(estado: string): string {
    switch (estado) {
      case 'activa': return 'ACTIVA';
      case 'asignada': return 'ASIGNADA';
      case 'finalizada': return 'FINALIZADA';
      default: return '';
    }
  }

  // Navegar al mapa de la ruta seleccionada
  verRuta(ruta: Ruta) {
    // TODO: pasar el id/codigo de la ruta seleccionada para cargar sus coordenadas en el mapa
    // this.router.navigate(['/tabs/manifest'], { queryParams: { rutaId: ruta.codigo } });
    console.log('Ver ruta:', ruta.codigo);
  }

  continuarRuta(ruta: Ruta) {
    // TODO: marcar ruta como activa en backend y abrir mapa
    console.log('Continuar ruta:', ruta.codigo);
  }
}
