import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, IonButton, IonIcon, IonCard, IonCardContent, IonRefresher, IonRefresherContent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { notificationsOutline, mapOutline, warningOutline, chatbubbleOutline, playCircleOutline } from 'ionicons/icons';
import { Auth } from '../../services/auth';
import { inject, effect } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, IonCard, IonCardContent, IonRefresher, IonRefresherContent, CommonModule, FormsModule]
})
export class DashboardPage implements OnInit {

  private auth = inject(Auth);

  usuarioNombre = '';
  rutaAsignada = 'Ruta 4 - Centro Norte';
  horaInicio = '06:00 AM';

  constructor() {
    addIcons({ notificationsOutline, mapOutline, warningOutline, chatbubbleOutline, playCircleOutline});
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
  }

  iniciarRecorrido() {
    console.log("Iniciando recorrido para", this.rutaAsignada);
    // Lógica para empezar a reportar GPS
  }

  handleRefresh(event: any) {
    setTimeout(() => {
      event.target.complete();
    }, 1500);
  }

}
