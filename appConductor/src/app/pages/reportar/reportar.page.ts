import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonButtons, IonBackButton, IonIcon, IonButton, ToastController, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { constructOutline, banOutline, mapOutline, carOutline, ellipsisHorizontalOutline, cameraOutline, sendOutline, closeCircleOutline } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { RutaService } from '../../services/ruta.service';

@Component({
  selector: 'app-reportar',
  templateUrl: './reportar.page.html',
  styleUrls: ['./reportar.page.scss'],
  standalone: true,
  imports: [IonContent, IonButtons, IonBackButton, IonIcon, IonButton, FormsModule]
})
export class ReportarPage implements OnInit {

  tipoIncidencia: string = '';
  descripcion: string = '';
  fotoBase64: string | null = null;
  enviando = false;
  recorridoIdActual: string | null = null;

  private rutaService = inject(RutaService);
  private toastCtrl = inject(ToastController);
  private navCtrl = inject(NavController);

  constructor() { 
    addIcons({ constructOutline, banOutline, mapOutline, carOutline, ellipsisHorizontalOutline, cameraOutline, sendOutline, closeCircleOutline });
  }

  ngOnInit() {
    // Obtener el recorrido asignado actual
    this.rutaService.obtenerRecorridoAsignado().subscribe({
      next: (res) => {
        if (res && res.recorrido) {
          this.recorridoIdActual = res.recorrido.id;
        }
      }
    });
  }

  seleccionarTipo(tipo: string) {
    this.tipoIncidencia = tipo;
  }

  async tomarFoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera // Usa la cámara directamente
      });

      if (image && image.dataUrl) {
        this.fotoBase64 = image.dataUrl;
      }
    } catch (e) {
      console.warn('Cámara cancelada o no disponible', e);
      // Opcional: mostrar un Toast si falla
    }
  }

  removerFoto() {
    this.fotoBase64 = null;
  }

  async enviarReporte() {
    if (!this.tipoIncidencia) return;

    this.enviando = true;

    const payload = {
      tipo: this.tipoIncidencia,
      descripcion: this.descripcion,
      foto: this.fotoBase64 // Se envía como base64 o null
    };

    this.rutaService.reportarIncidencia(this.recorridoIdActual, payload).subscribe({
      next: async () => {
        this.enviando = false;
        await this.mostrarToast('✅ Reporte enviado al centro de control');
        this.navCtrl.back();
      },
      error: async (err) => {
        this.enviando = false;
        const mensaje = err?.error?.message || 'Error al enviar el reporte';
        await this.mostrarToast('⚠️ ' + mensaje);
      }
    });
  }

  async mostrarToast(mensaje: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 3000,
      color: 'dark',
      position: 'top'
    });
    await toast.present();
  }
}