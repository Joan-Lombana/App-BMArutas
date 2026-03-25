import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, IonButton, IonIcon, IonInput, IonItem, IonSpinner
} from '@ionic/angular/standalone';
import { RouterModule, Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline, mailOutline, lockClosedOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, IonInput, IonItem, IonSpinner, CommonModule, FormsModule, RouterModule]
})
export class LoginPage implements OnInit {

  verContrasena = false;
  cargando = false;
  correo = '';
  contrasena = '';

  constructor(private router: Router) {
    addIcons({ eyeOutline, eyeOffOutline, mailOutline, lockClosedOutline });
  }

  ngOnInit() {}

  toggleContrasena() {
    this.verContrasena = !this.verContrasena;
  }

  iniciarSesion() {
    this.cargando = true;
    // Aquí irá la llamada al AuthService real
    setTimeout(() => {
      this.cargando = false;
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }, 1500);
  }

}
