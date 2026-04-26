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

      next: (res: any) => {

        this.cargando = false;

        const rol = res.usuario?.rol;

        console.log('ROL:', rol);

        // ✅ ADMIN o CONDUCTOR pueden entrar

        if (rol === 'admin' || rol === 'conductor') {

          this.router.navigate(
            ['/tabs/ruta'],
            { replaceUrl: true }
          );

        } else {

          alert(`No autorizado. Rol recibido: ${rol}`);
          this.auth.logout();

        }

      },

      error: (err) => {
        this.cargando = false;
        console.log('API Error:', err);
        
        let msg = '';
        if (err.status === 0) {
          msg = `Red: Error 0. Backend apagado o bloqueado. (${err.message})`;
        } else if (err.status === 401) {
          msg = 'Credenciales incorrectas (401). Verifica el correo y la contraseña en la base de datos.';
        } else {
          msg = `Error ${err.status}: ${err.error?.message || err.message}`;
        }
        
        alert(msg);
      }

    });

  }

}
