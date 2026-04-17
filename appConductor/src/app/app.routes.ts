import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { roleGuard } from './guards/roles-guard';

export const routes: Routes = [

  // Inicio con Splash
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full'
  },

  {
    path: 'splash',
    loadComponent: () =>
      import('./pages/splash/splash.page')
        .then(m => m.SplashPage)
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page')
        .then(m => m.LoginPage)
  },

  // ✅ TABS — requiere autenticación
  {
    path: 'tabs',
    loadComponent: () => import('./pages/tabs/tabs.page').then(m => m.TabsPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'conductor'] },
    children: [
      {
        path: 'ruta',
        loadComponent: () => import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage)
      },
      {
        path: 'mis-rutas',
        loadComponent: () => import('./pages/mis-rutas/mis-rutas.page').then(m => m.MisRutasPage)
      },
      {
        path: 'manifest',
        loadComponent: () => import('./pages/mi-ruta/mi-ruta.page').then(m => m.MiRutaPage)
      },
      {
        path: '',
        redirectTo: '/tabs/ruta',
        pathMatch: 'full'
      }
    ]
  },

  // Redirección legacy del dashboard directo
  {
    path: 'dashboard',
    redirectTo: '/tabs/ruta',
    pathMatch: 'full'
  },

  // Reportar incidencia
  {
    path: 'reportar',
    loadComponent: () => import('./pages/reportar/reportar.page').then(m => m.ReportarPage)
  },

  // Fallback
  {
    path: '**',
    redirectTo: 'splash'
  }

];
