import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { locationOutline, navigateOutline, timeOutline } from 'ionicons/icons';

// Registramos los componentes de Swiper (swiper-container y swiper-slide)
import { register } from 'swiper/element/bundle';
register();

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class OnboardingPage implements OnInit {

  constructor(private router: Router) {
    addIcons({ locationOutline, navigateOutline, timeOutline });
  }

  ngOnInit() {
  }

  comenzar() {
    console.log("Navegando al Mapa...");
    localStorage.setItem('onboarding_done', 'true');
    this.router.navigate(['/tabs/mapa'], { replaceUrl: true });
  }

}
