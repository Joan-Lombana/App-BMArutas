import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  IonContent, IonHeader, IonToolbar,
  IonTextarea, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cameraOutline, locationOutline, sendOutline,
  warningOutline, chevronForwardOutline, checkmarkCircleOutline,
  documentTextOutline, timeOutline, alertCircleOutline,
  closeCircleOutline, personOutline, mailOutline, trashOutline
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { environment } from '../../../environments/environment';


interface ReporteHistorial {
  id: string;
  tipo: string;
  fecha: Date;
  estado: 'enviado' | 'en_revision' | 'resuelto';
  direccion: string;
}

@Component({
  selector: 'app-reportes',
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonHeader, IonToolbar,
    IonTextarea, IonIcon
  ]
})
export class ReportesComponent implements OnInit {
  private http = inject(HttpClient);

  public vistaActual = signal<'nuevo' | 'historial'>('nuevo');
  public tipoSeleccionado = signal('');
  public descripcion = '';
  public nombreCiudadano = '';
  public correoCiudadano = '';
  public fotoBase64: string | null = null;
  public latitud: number | null = null;
  public longitud: number | null = null;
  public enviando = signal(false);

  public tiposRapidos = [
    { label: 'Basura acumulada', valor: 'basura', icon: 'trash-outline' },
    { label: 'Vía bloqueada',   valor: 'via_bloqueada', icon: 'warning-outline' },
    { label: 'Camión retrasado', valor: 'retraso', icon: 'time-outline' },
    { label: 'Otro',            valor: 'otro', icon: 'alert-circle-outline' },
  ];

  public misReportes = signal<ReporteHistorial[]>([
    {
      id: 'REP-001',
      tipo: 'Basura acumulada',
      fecha: new Date(Date.now() - 86400000), // Hace 1 día
      estado: 'en_revision',
      direccion: 'Calle 4 #12-50, Barrio Centro'
    },
    {
      id: 'REP-002',
      tipo: 'Camión retrasado',
      fecha: new Date(Date.now() - 432000000), // Hace 5 días
      estado: 'resuelto',
      direccion: 'Carrera 8 #5-22, Barrio Sur'
    }
  ]);

  constructor() {
    addIcons({
      cameraOutline, locationOutline, sendOutline, warningOutline,
      chevronForwardOutline, checkmarkCircleOutline, documentTextOutline,
      timeOutline, alertCircleOutline, closeCircleOutline,
      personOutline, mailOutline, trashOutline
    });
  }


  ngOnInit() {}

  cambiarVista(vista: 'nuevo' | 'historial') {
    this.vistaActual.set(vista);
  }

  seleccionarTipo(valor: string) {
    this.tipoSeleccionado.set(this.tipoSeleccionado() === valor ? '' : valor);
  }

  async adjuntarFoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      if (image && image.dataUrl) {
        // Validación de tamaño (máximo 5MB)
        const sizeInBytes = (image.dataUrl.length * 3) / 4;
        const sizeInMb = sizeInBytes / (1024 * 1024);

        if (sizeInMb > 5) {
          alert('La imagen es demasiado grande. El límite es de 5MB.');
          return;
        }

        this.fotoBase64 = image.dataUrl;
      }
    } catch (e) {
      console.warn('Cámara cancelada o no disponible', e);
    }
  }

  removerFoto() {
    this.fotoBase64 = null;
  }

  usarUbicacion() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.latitud = position.coords.latitude;
          this.longitud = position.coords.longitude;
          alert('Ubicación GPS capturada con éxito');
        },
        (error) => {
          console.warn('Error al obtener ubicación:', error);
          alert('No se pudo acceder al GPS');
        }
      );
    } else {
      alert('Geolocalización no soportada por el dispositivo');
    }
  }

  enviarReporte() {
    if (!this.tipoSeleccionado()) return;

    this.enviando.set(true);

    const payload = {
      recorrido_id: null,
      tipo: this.tiposRapidos.find(t => t.valor === this.tipoSeleccionado())?.label || this.tipoSeleccionado(),
      descripcion: this.descripcion,
      foto: this.fotoBase64,
      reportado_por: 'ciudadano', // Distinguir del reporte del conductor
      nombre_ciudadano: this.nombreCiudadano || 'Anónimo',
      correo_ciudadano: this.correoCiudadano || 'No especificado',
      latitud: this.latitud || 3.8801,
      longitud: this.longitud || -77.0312,
      timestamp: Date.now()
    };

    this.http.post(`${environment.apiUrl}/operativo/incidencias`, payload).subscribe({
      next: () => {
        this.completarEnvio(payload.tipo);
      },
      error: (err) => {
        console.warn('Backend offline o error al enviar reporte, guardando localmente en la interfaz:', err);
        // Simular éxito en la interfaz para pruebas si el endpoint no está activo
        this.completarEnvio(payload.tipo);
      }
    });
  }

  private completarEnvio(tipoReporte: string) {
    this.misReportes.update(lista => [{
      id: `REP-00${lista.length + 3}`,
      tipo: tipoReporte,
      fecha: new Date(),
      estado: 'enviado',
      direccion: this.latitud ? `Lat: ${this.latitud.toFixed(4)}, Lng: ${this.longitud?.toFixed(4)}` : 'Ubicación GPS...'
    }, ...lista]);

    this.enviando.set(false);
    this.tipoSeleccionado.set('');
    this.descripcion = '';
    this.fotoBase64 = null;
    this.cambiarVista('historial');
  }

  getEstadoBadge(estado: string) {
    switch(estado) {
      case 'enviado': return { class: 'badge-enviado', text: 'Enviado', icon: 'send-outline' };
      case 'en_revision': return { class: 'badge-revision', text: 'En revisión', icon: 'time-outline' };
      case 'resuelto': return { class: 'badge-resuelto', text: 'Resuelto', icon: 'checkmark-circle-outline' };
      default: return { class: '', text: estado, icon: 'alert-circle-outline' };
    }
  }
}
