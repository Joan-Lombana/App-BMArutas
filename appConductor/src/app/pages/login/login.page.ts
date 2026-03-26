import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonContent,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonSpinner
} from '@ionic/angular/standalone';

import { RouterModule, Router } from '@angular/router';

import { addIcons } from 'ionicons';
import {
  eyeOutline,
  eyeOffOutline,
  mailOutline,
  lockClosedOutline
} from 'ionicons/icons';

import { Auth } from '../../services/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonInput,
    IonItem,
    IonSpinner,
    CommonModule,
    FormsModule,
    RouterModule
  ]
})
export class LoginPage implements OnInit {

  private auth = inject(Auth);

  verContrasena = false;
  cargando = false;

  correo = '';
  contrasena = '';

  constructor(private router: Router) {
    addIcons({
      eyeOutline,
      eyeOffOutline,
      mailOutline,
      lockClosedOutline
    });
  }

  ngOnInit() {}

  toggleContrasena() {
    this.verContrasena = !this.verContrasena;
  }

  // ============================
  // LOGIN REAL
  // ============================

  iniciarSesion() {

    if (!this.correo || !this.contrasena) {
      alert('Ingrese correo y contraseña');
      return;
    }

    this.cargando = true;

    this.auth.login(
      this.correo,
      this.contrasena
    ).subscribe({

      next: () => {

        this.cargando = false;

        const rol = this.auth.getRol();

        console.log('ROL:', rol);

        // ✅ ADMIN o CONDUCTOR pueden entrar

        if (rol === 'admin' || rol === 'conductor') {

          this.router.navigate(
            ['/dashboard'],
            { replaceUrl: true }
          );

        } else {

          alert('No autorizado');
          this.auth.logout();

        }

      },

      error: (err) => {

        this.cargando = false;

        console.log(err);

        alert(
          err?.error?.message ||
          'Credenciales incorrectas'
        );

      }

    });

  }

}
