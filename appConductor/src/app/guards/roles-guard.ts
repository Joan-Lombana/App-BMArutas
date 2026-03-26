import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const roleGuard: CanActivateFn = (route) => {

  const auth = inject(Auth);
  const router = inject(Router);

  const rol = auth.getRol();

  const rolesPermitidos = route.data?.['roles'];

  if (!rol) {
    router.navigate(['/login']);
    return false;
  }

  if (!rolesPermitidos.includes(rol)) {
    router.navigate(['/login']);
    return false;
  }

  return true;

};