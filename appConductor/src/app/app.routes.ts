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

  // ✅ SOLO USUARIOS AUTENTICADOS
  // ✅ ADMIN y CONDUCTOR

  {
    path: 'dashboard',

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ['admin', 'conductor']
    },

    loadComponent: () =>
      import('./pages/dashboard/dashboard.page')
        .then(m => m.DashboardPage)
  },

  // Fallback
  {
    path: '**',
    redirectTo: 'splash'
  }

];
