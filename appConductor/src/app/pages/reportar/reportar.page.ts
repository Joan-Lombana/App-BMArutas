import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonButtons, IonBackButton, IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { constructOutline, banOutline, mapOutline, carOutline, ellipsisHorizontalOutline, cameraOutline, sendOutline } from 'ionicons/icons';

@Component({
  selector: 'app-reportar',
  templateUrl: './reportar.page.html',
  styleUrls: ['./reportar.page.scss'],
  standalone: true,
  imports: [IonContent, IonButtons, IonBackButton, IonIcon, IonButton, CommonModule, FormsModule]
})
export class ReportarPage {

  tipoIncidencia: string = '';

  constructor() { 
    addIcons({ constructOutline, banOutline, mapOutline, carOutline, ellipsisHorizontalOutline, cameraOutline, sendOutline });
  }

  seleccionarTipo(tipo: string) {
    this.tipoIncidencia = tipo;
  }

  enviarReporte() {
    console.log("Reporte enviado:", this.tipoIncidencia);
  }
}
