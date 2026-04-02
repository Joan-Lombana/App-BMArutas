import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class Auth {

  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;

  // 🔥 inicializa desde storage correctamente
  currentUser = signal<any | null>(this.getUserFromStorage());

  // ============================
  // LOGIN
  // ============================

  login(correo: string, password: string): Observable<any> {

    return this.http.post(`${this.apiUrl}/login`, {
      correo,
      password
    }).pipe(

      tap((res: any) => {

        // ✅ Guardar token
        if (res?.access_token) {
          localStorage.setItem('token', res.access_token);
        }

        // ✅ Guardar usuario limpio
        if (res?.usuario) {

          const usuario = res.usuario;

          localStorage.setItem(
            'usuario',
            JSON.stringify(usuario)
          );

          this.currentUser.set(usuario);
        }

      })

    );

  }

  // ============================
  // TOKEN
  // ============================

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // ============================
  // USUARIO (LOCAL STORAGE)
  // ============================

  private getUserFromStorage(): any | null {

    try {
      const user = localStorage.getItem('usuario');
      return user ? JSON.parse(user) : null;
    } catch (error) {
      console.error('Error leyendo usuario del storage', error);
      return null;
    }

  }

  // ============================
  // ROL
  // ============================

  getRol(): string | null {

    const user = this.currentUser();

    if (!user) return null;

    return user.rol ?? null;

  }

  // ============================
  // LOGOUT
  // ============================

  logout() {

    localStorage.removeItem('token');
    localStorage.removeItem('usuario');

    this.currentUser.set(null);

  }

  // ============================
  // HEADERS CON TOKEN
  // ============================

  getAuthHeaders() {

    const token = this.getToken();

    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token || ''}`
      })
    };

  }

}
