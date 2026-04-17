import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';
import { of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export const roleGuard: CanActivateFn = (route) => {

  const auth = inject(Auth);
  const router = inject(Router);

  const rolesPermitidos = route.data?.['roles'];
  const user = auth.currentUser();

  // ✅ Si ya hay usuario en memoria
  if (user) {
    if (rolesPermitidos?.includes(user.rol)) {
      return true;
    }
    router.navigate(['/login']);
    return false;
  }

  // 🔥 Si no hay usuario → intentar cargarlo
  return auth.getProfile().pipe(

    map((user) => {
      if (user && rolesPermitidos?.includes(user.rol)) {
        return true;
      }

      router.navigate(['/login']);
      return false;
    }),

    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })

  );

};