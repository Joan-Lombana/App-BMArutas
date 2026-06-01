import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import {
  IonContent, IonHeader, IonToolbar, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  notificationsOutline, alertCircleOutline, informationCircleOutline,
  checkmarkCircleOutline, arrowBackOutline, notificationsOffOutline
} from 'ionicons/icons';

interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  fecha: string;
  tipo: 'alerta' | 'info' | 'completado';
  leida: boolean;
}

@Component({
  selector: 'app-notificaciones',
  templateUrl: './notificaciones.component.html',
  styleUrls: ['./notificaciones.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonIcon
  ]
})
export class NotificacionesComponent implements OnInit {
  private location = inject(Location);

  public filtroActivo = signal<'todas' | 'alerta' | 'info' | 'completado'>('todas');
  
  public notificaciones = signal<Notificacion[]>([]);

  public notificacionesFiltradas = computed(() => {
    const f = this.filtroActivo();
    if (f === 'todas') return this.notificaciones();
    return this.notificaciones().filter(n => n.tipo === f);
  });

  constructor() {
    addIcons({
      notificationsOutline, alertCircleOutline, informationCircleOutline,
      checkmarkCircleOutline, arrowBackOutline, notificationsOffOutline
    });
  }

  ngOnInit() {}

  setFiltro(f: 'todas' | 'alerta' | 'info' | 'completado') {
    this.filtroActivo.set(f);
  }

  marcarComoLeida(notif: Notificacion) {
    if (!notif.leida) {
      this.notificaciones.update(lista => {
        const index = lista.findIndex(n => n.id === notif.id);
        if (index > -1) {
          const nuevaLista = [...lista];
          nuevaLista[index] = { ...nuevaLista[index], leida: true };
          return nuevaLista;
        }
        return lista;
      });
    }
  }

  volver() {
    this.location.back();
  }

  getColor(tipo: string): string {
    switch(tipo) {
      case 'alerta': return '#EF4444'; // Red
      case 'info': return '#3B82F6';   // Blue
      case 'completado': return '#96B4EA';
      default: return '#64748b';
    }
  }

  getIcono(tipo: string): string {
    switch(tipo) {
      case 'alerta': return 'alert-circle-outline';
      case 'info': return 'information-circle-outline';
      case 'completado': return 'checkmark-circle-outline';
      default: return 'notifications-outline';
    }
  }

  getBadgeLabel(tipo: string): string {
    switch(tipo) {
      case 'alerta': return 'URGENTE';
      case 'info': return 'AVISO';
      case 'completado': return 'LISTO';
      default: return 'INFO';
    }
  }
}
