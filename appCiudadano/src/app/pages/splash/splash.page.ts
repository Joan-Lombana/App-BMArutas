import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { markStartupSplashAsSeen } from '../../guards/startup-splash.guard';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, FormsModule]
})
export class SplashPage implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
    markStartupSplashAsSeen();
    const yaVioOnboarding = localStorage.getItem('onboarding_done') === 'true';

    setTimeout(() => {
      if (yaVioOnboarding) {
        // Ya hizo el onboarding, va directo al mapa
        this.router.navigate(['/tabs/mapa'], { replaceUrl: true });
      } else {
        // Primera vez, muestra el onboarding
        this.router.navigate(['/onboarding'], { replaceUrl: true });
      }
    }, 2500);
  }

}
