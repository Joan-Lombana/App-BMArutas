import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, IonButton } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import { busOutline } from 'ionicons/icons';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, IonButton, CommonModule, RouterModule]
})
export class SplashPage implements OnInit {

  mostrarBoton = false; // El botón aparece después de la animación del logo

  constructor() {
    addIcons({ busOutline });
  }

  ngOnInit() {
    // El botón "Comenzar" aparece luego de que termina la animación
    setTimeout(() => {
      this.mostrarBoton = true;
    }, 2000);
  }

}
