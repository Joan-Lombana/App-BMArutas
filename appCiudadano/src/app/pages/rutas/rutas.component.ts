import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonSearchbar,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trashOutline, timeOutline, checkmarkCircleOutline, searchOutline,
  mapOutline, calendarOutline, locationOutline, chevronForwardOutline
} from 'ionicons/icons';
import { catchError, forkJoin, of } from 'rxjs';
import { RutasService, RutaResponse } from '../../services/rutas.service';
import { RecorridoResponse, RecorridosService } from '../../services/recorridos.service';
import { MapaService } from '../../services/mapa.service';
import { EstadoRecorridoReal, SocketService } from '../../services/socket.service';

type Filtro = 'todas' | 'activas' | 'programadas';

interface RutaCiudadano extends RutaResponse {
  activa?: boolean;
  programada?: boolean;
  pausada?: boolean;
  recorrido_id?: string;
  estado_recorrido?: string;
  fecha_programada?: string;
  vehiculo_placa?: string;
}

@Component({
  selector: 'app-rutas',
  templateUrl: './rutas.component.html',
  styleUrls: ['./rutas.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonSearchbar,
    IonIcon
  ]
})
export class RutasComponent implements OnInit, OnDestroy {
  private rutasService = inject(RutasService);
  private recorridosService = inject(RecorridosService);
  private mapaService = inject(MapaService);
  private socket = inject(SocketService);
  private router = inject(Router);

  public busqueda = signal('');
  public filtro = signal<Filtro>('todas');
  public rutas = signal<RutaCiudadano[]>([]);
  public cargando = signal(true);

  private onCambioRecorrido = (_data: EstadoRecorridoReal | any) => this.cargarRutas();

  public rutasFiltradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const f = this.filtro();
    let lista = this.rutas();

    if (f === 'activas') lista = lista.filter((r) => r.activa || r.pausada);
    if (f === 'programadas') lista = lista.filter((r) => r.programada);
    if (q) {
      lista = lista.filter((r) =>
        (r.nombre_ruta || '').toLowerCase().includes(q) ||
        (r.descripcion || '').toLowerCase().includes(q)
      );
    }

    return lista;
  });

  public rutasActivas = computed(() => this.rutasFiltradas().filter((r) => r.activa || r.pausada));
  public rutasProgramadas = computed(() => this.rutasFiltradas().filter((r) => r.programada));

  constructor() {
    addIcons({
      trashOutline, timeOutline, checkmarkCircleOutline, searchOutline,
      mapOutline, calendarOutline, locationOutline, chevronForwardOutline
    });
  }

  ngOnInit() {
    this.escucharCambiosRecorridos();
    this.cargarRutas();
  }

  ionViewWillEnter() {
    this.cargarRutas();
  }

  ngOnDestroy() {
    this.socket.offEstadoRecorrido(this.onCambioRecorrido);
    this.socket.offRecorridoAsignado(this.onCambioRecorrido);
    this.socket.offRecorridoEliminado(this.onCambioRecorrido);
  }

  cargarRutas() {
    this.cargando.set(true);

    forkJoin({
      rutas: this.rutasService.obtenerRutas().pipe(catchError((err) => {
        console.warn('Error al obtener rutas:', err);
        return of([]);
      })),
      recorridos: this.recorridosService.obtenerRecorridosVisiblesCiudadano().pipe(catchError((err) => {
        console.warn('Error al obtener recorridos visibles:', err);
        return of([]);
      }))
    }).subscribe(({ rutas, recorridos }) => {
      this.rutas.set(this.construirRutasVisibles(rutas, recorridos));
      this.cargando.set(false);
    });
  }

  onBusqueda(event: any) {
    this.busqueda.set(event.detail.value ?? '');
  }

  setFiltro(f: Filtro) {
    this.filtro.set(f);
  }

  verEnMapa(ruta: RutaCiudadano) {
    this.mapaService.seleccionarRutaParaMapa({
      id: ruta.id,
      nombre: ruta.nombre_ruta,
      color: ruta.color || ruta.color_hex || '#96B4EA',
      shape: ruta.shape
    });
    this.router.navigate(['/tabs/mapa']);
  }

  getEstadoRuta(ruta: RutaCiudadano): string {
    if (ruta.pausada) return 'Pausada';
    if (ruta.activa) return 'Activa';
    if (ruta.programada) return 'Programada';
    return ruta.estado_recorrido || 'Disponible';
  }

  get totalActivas(): number {
    return this.rutas().filter((r) => r.activa || r.pausada).length;
  }

  get totalProgramadas(): number {
    return this.rutas().filter((r) => r.programada).length;
  }

  private escucharCambiosRecorridos() {
    this.socket.offEstadoRecorrido(this.onCambioRecorrido);
    this.socket.offRecorridoAsignado(this.onCambioRecorrido);
    this.socket.offRecorridoEliminado(this.onCambioRecorrido);
    this.socket.onEstadoRecorrido(this.onCambioRecorrido);
    this.socket.onRecorridoAsignado(this.onCambioRecorrido);
    this.socket.onRecorridoEliminado(this.onCambioRecorrido);
  }

  private construirRutasVisibles(rutas: RutaResponse[], recorridos: RecorridoResponse[]): RutaCiudadano[] {
    const rutasPorId = new Map(rutas.map((ruta) => [String(ruta.id), ruta]));
    const visiblesPorRuta = new Map<string, RutaCiudadano>();

    recorridos.forEach((recorrido) => {
      const rutaId = this.recorridosService.obtenerRutaId(recorrido);
      if (!rutaId) return;

      const rutaBase = recorrido.ruta ?? rutasPorId.get(rutaId);
      if (!rutaBase) return;

      const estado = recorrido.estado ?? '';
      const rutaVisible: RutaCiudadano = {
        ...rutaBase,
        id: String(rutaBase.id ?? rutaId),
        color: rutaBase.color || rutaBase.color_hex,
        activa: this.recorridosService.esActivo(estado),
        programada: this.recorridosService.esProgramado(estado),
        pausada: this.recorridosService.esPausado(estado),
        estado_recorrido: estado,
        recorrido_id: recorrido.id,
        fecha_programada: recorrido.fecha_programada,
        vehiculo_placa: recorrido.vehiculo?.placa,
      };

      const actual = visiblesPorRuta.get(rutaId);
      if (!actual || this.prioridadEstado(rutaVisible) > this.prioridadEstado(actual)) {
        visiblesPorRuta.set(rutaId, rutaVisible);
      }
    });

    return Array.from(visiblesPorRuta.values())
      .sort((a, b) => this.prioridadEstado(b) - this.prioridadEstado(a));
  }

  private prioridadEstado(ruta: RutaCiudadano): number {
    if (ruta.activa) return 3;
    if (ruta.pausada) return 2;
    if (ruta.programada) return 1;
    return 0;
  }
}
