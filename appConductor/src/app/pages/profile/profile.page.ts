import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, IonIcon, IonButton, IonBackButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personOutline, callOutline, mailOutline, logOutOutline, createOutline, arrowBackOutline } from 'ionicons/icons';
import { Auth } from '../../services/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, IonButton, IonBackButton, CommonModule, FormsModule]
})
export class ProfilePage implements OnInit {
  private auth = inject(Auth);
  private router = inject(Router);

  usuario: any = null;

  constructor() {
    addIcons({ personOutline, callOutline, mailOutline, logOutOutline, createOutline, arrowBackOutline });
  }

  ngOnInit() {
    this.usuario = this.auth.currentUser();
    if (!this.usuario) {
      this.auth.getProfile().subscribe({
        next: (user) => {
          this.usuario = user;
        }
      });
    }
  }

  cerrarSesion() {
    this.auth.logout();
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
