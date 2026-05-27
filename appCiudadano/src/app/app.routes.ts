import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'tabs',
    pathMatch: 'full',
  },
  {
    path: 'splash',
    loadComponent: () => import('./pages/splash/splash.page').then( m => m.SplashPage)
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding.page').then( m => m.OnboardingPage)
  },
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.component').then(m => m.TabsComponent),
    children: [
      {
        path: 'mapa',
        loadComponent: () => import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage)
      },
      {
        path: 'rutas',
        loadComponent: () => import('./pages/rutas/rutas.component').then(m => m.RutasComponent)
      },
      {
        path: 'reportes',
        loadComponent: () => import('./pages/reportes/reportes.component').then(m => m.ReportesComponent)
      },
      {
        path: 'notificaciones',
        loadComponent: () => import('./pages/notificaciones/notificaciones.component').then(m => m.NotificacionesComponent)
      },
      {
        path: '',
        redirectTo: 'mapa',
        pathMatch: 'full'
      }
    ]
  }
];
