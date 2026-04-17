import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import { timeOutline, chevronForwardOutline, checkmarkCircle, playCircle, cloudOfflineOutline, notificationsOutline } from 'ionicons/icons';

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
  imports: [IonContent, IonIcon, CommonModule, FormsModule, RouterModule]
})
export class MisRutasPage implements OnInit {

  // Nombre del conductor — vendrá del servicio de autenticación
  conductorNombre: string = '';

  // Fecha de hoy formateada
  fechaHoy: string = '';

  // TODO: Reemplazar con llamada real → GET /api/rutas?conductorId={id}&fecha={hoy}
  // Solo se deben recibir las rutas del conductor autenticado (filtrado en backend)
  rutas: Ruta[] = [];

  // TODO: Reemplazar con llamada real → GET /api/jornada?conductorId={id}&fecha={hoy}
  resumenJornada: ResumenJornada | null = null;

  constructor() {
    addIcons({ timeOutline, chevronForwardOutline, checkmarkCircle, playCircle, cloudOfflineOutline, notificationsOutline });
  }

  ngOnInit() {
    this.setFechaHoy();
  }

  setFechaHoy() {
    const ahora = new Date();
    const opciones: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    };
    this.fechaHoy = ahora.toLocaleDateString('es-CO', opciones);
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
