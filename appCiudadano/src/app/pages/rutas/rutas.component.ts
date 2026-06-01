import { Component, OnInit, signal, inject, computed } from '@angular/core';
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
import { RutasService, RutaResponse } from '../../services/rutas.service';
import { RecorridosService } from '../../services/recorridos.service';
import { MapaService } from '../../services/mapa.service';

type Filtro = 'todas' | 'activas' | 'inactivas';

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
export class RutasComponent implements OnInit {
  private rutasService = inject(RutasService);
  private recorridosService = inject(RecorridosService);
  private mapaService = inject(MapaService);
  private router = inject(Router);

  public busqueda = signal('');
  public filtro = signal<Filtro>('todas');
  public rutas = signal<RutaResponse[]>([]);
  public cargando = signal(true);

  public rutasFiltradas = computed(() => {
    const q = this.busqueda().toLowerCase();
    const f = this.filtro();
    let lista = this.rutas();

    if (f === 'activas')   lista = lista.filter(r => r.activa);
    if (f === 'inactivas') lista = lista.filter(r => !r.activa);
    if (q) lista = lista.filter(r =>
      (r.nombre_ruta || '').toLowerCase().includes(q) ||
      (r.descripcion || '').toLowerCase().includes(q)
    );
    return lista;
  });

  public rutasActivas = computed(() => this.rutasFiltradas().filter(r => r.activa));
  public rutasInactivas = computed(() => this.rutasFiltradas().filter(r => !r.activa));

  constructor() {
    addIcons({
      trashOutline, timeOutline, checkmarkCircleOutline, searchOutline,
      mapOutline, calendarOutline, locationOutline, chevronForwardOutline
    });
  }

  ngOnInit() {
    this.rutasService.obtenerRutas().subscribe({
      next: (rutasData) => {
        this.recorridosService.obtenerRecorridosActivos().subscribe({
          next: (recorridosActivos) => {
            const activeRouteIds = new Set(
              recorridosActivos.map(r => r.ruta_id || r.ruta?.id)
            );
            const mappedRutas = rutasData.map(r => ({
              ...r,
              activa: activeRouteIds.has(r.id)
            }));
            this.rutas.set(mappedRutas);
            this.cargando.set(false);
          },
          error: (err) => {
            console.warn('Error al obtener recorridos activos para las rutas:', err);
            this.rutas.set(rutasData);
            this.cargando.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Error al obtener rutas:', err);
        this.cargando.set(false);
      }
    });
  }

  onBusqueda(event: any) {
    this.busqueda.set(event.detail.value ?? '');
  }

  setFiltro(f: Filtro) {
    this.filtro.set(f);
  }

  verEnMapa(ruta: RutaResponse) {
    this.mapaService.seleccionarRutaParaMapa({
      id: ruta.id,
      nombre: ruta.nombre_ruta,
      color: ruta.color || '#96B4EA',
      shape: (ruta as any).shape
    });
    // Navegar a la pestaÃ±a del mapa
    this.router.navigate(['/tabs/mapa']);
  }

  get totalActivas(): number {
    return this.rutas().filter(r => r.activa).length;
  }

  get totalInactivas(): number {
    return this.rutas().filter(r => !r.activa).length;
  }
}
