import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { 
  IonContent, IonButton, IonIcon, IonRefresher, IonRefresherContent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { notificationsOutline, mapOutline, warningOutline, chatbubbleOutline, playCircleOutline, timeOutline, headsetOutline, playSharp, carSportOutline, chevronForwardOutline, calendarOutline, cloudOfflineOutline, busOutline, personOutline } from 'ionicons/icons';
import { Auth } from '../../services/auth';
import { RutaService, Ruta } from '../../services/ruta.service';
import { OfflineService } from '../../services/offline.service';
import { inject, effect } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, IonRefresher, IonRefresherContent, CommonModule, FormsModule, RouterLink, DatePipe]
})
export class DashboardPage implements OnInit {

  private auth = inject(Auth);
  private rutaService = inject(RutaService);
  public offlineService = inject(OfflineService); // ✅ Inyectado para UI

  usuarioNombre = '';
  
  // Estado de la ruta
  rutaAsignada: Ruta | null = null;
  recorridoAsignado: any | null = null; // El registro de recorrido del backend
  cargandoRuta = true;

  constructor() {
    addIcons({ notificationsOutline, mapOutline, warningOutline, chatbubbleOutline, playCircleOutline, timeOutline, headsetOutline, playSharp, carSportOutline, chevronForwardOutline, calendarOutline, cloudOfflineOutline, busOutline, personOutline });
  }

  ngOnInit() {

    const user = this.auth.currentUser();
    if (!user) {
      this.auth.getProfile().subscribe({
        next: (user) => {
          this.usuarioNombre = user?.primerNombre || 'Conductor';
        }
      });
    } else {
      this.usuarioNombre = user.primerNombre;
    }

    this.cargarRutaAsignada();
  }

  cargarRutaAsignada() {
    this.cargandoRuta = true;
    this.rutaService.obtenerRecorridoAsignado().subscribe({
      next: (resultado) => {
        if (resultado) {
          this.recorridoAsignado = resultado.recorrido;
          this.rutaAsignada = resultado.ruta as Ruta;
          
          // UI extras si el backend no los devuelve
          if (this.rutaAsignada) {
            this.rutaAsignada.estado = this.recorridoAsignado?.estado || 'Programada';
            this.rutaAsignada.horario = this.rutaAsignada.horario || '06:00 AM - 02:00 PM';
            this.rutaAsignada.paradas = this.rutaAsignada.paradas || 12;
            this.rutaAsignada.estimado = this.rutaAsignada.estimado || '4h 20m';
          }
        } else {
          this.rutaAsignada = null;
          this.recorridoAsignado = null;
        }
        this.cargandoRuta = false;
      },
      error: () => {
        this.rutaAsignada = null;
        this.recorridoAsignado = null;
        this.cargandoRuta = false;
      }
    });
  }

  iniciarRecorrido() {
    console.log("Iniciando recorrido para", this.rutaAsignada);
    // Lógica para empezar a reportar GPS
  }

  handleRefresh(event: any) {
    this.cargarRutaAsignada();
    setTimeout(() => {
      event.target.complete();
    }, 1500);
  }

}
