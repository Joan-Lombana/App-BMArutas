import { Component, OnInit, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';

import {
  IonContent,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonSpinner,
  AlertController
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
    FormsModule,
    RouterModule
]
})
export class LoginPage implements OnInit {

  private auth = inject(Auth);
  private alertCtrl = inject(AlertController);

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

  async mostrarAlerta(titulo: string, mensaje: string) {
    const alert = await this.alertCtrl.create({
      header: titulo,
      message: mensaje,
      buttons: ['Entendido'],
      mode: 'ios'
    });
    await alert.present();
  }

  // ============================
  // LOGIN REAL
  // ============================

  iniciarSesion() {

    if (!this.correo || !this.contrasena) {
      this.mostrarAlerta('Campos vacíos', 'Por favor, ingresa tu correo electrónico y tu contraseña para continuar.');
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

          this.mostrarAlerta('Acceso denegado', `No tienes permisos de conductor asignados para ingresar.`);
          this.auth.logout();

        }

      },

      error: (err) => {
        this.cargando = false;
        console.log('API Error:', err);
        
        let msg = '';
        if (err.status === 0) {
          msg = 'No pudimos conectarnos al servidor de BMArutas. Verifica tu conexión a internet o intenta de nuevo en unos momentos.';
        } else if (err.status === 401) {
          msg = 'Correo electrónico o contraseña incorrectos. Por favor, verifica tus datos.';
        } else {
          msg = err.error?.message || 'No se pudo iniciar sesión. Ocurrió un error inesperado en el servidor.';
        }
        
        this.mostrarAlerta('Error al iniciar sesión', msg);
      }

    });

  }

}

