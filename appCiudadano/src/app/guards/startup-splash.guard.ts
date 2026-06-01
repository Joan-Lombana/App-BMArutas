import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

const STARTUP_SPLASH_SEEN_KEY = 'startup_splash_seen';

export const startupSplashGuard: CanActivateFn = () => {
  if (hasStartupSplashBeenSeen()) {
    return true;
  }

  return inject(Router).createUrlTree(['/splash']);
};

export const markStartupSplashAsSeen = () => {
  try {
    sessionStorage.setItem(STARTUP_SPLASH_SEEN_KEY, 'true');
  } catch {
    // If session storage is unavailable, keep the app usable.
  }
};

const hasStartupSplashBeenSeen = () => {
  try {
    return sessionStorage.getItem(STARTUP_SPLASH_SEEN_KEY) === 'true';
  } catch {
    return true;
  }
};
