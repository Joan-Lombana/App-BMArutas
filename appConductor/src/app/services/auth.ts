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

  currentUser = signal<any>(this.getUserFromStorage());

  // ============================
  // LOGIN
  // ============================

  login(correo: string, password: string): Observable<any> {

    return this.http.post(`${this.apiUrl}/login`, {
      correo,
      password
    }).pipe(

      tap((res: any) => {

        if (res.access_token) {
          localStorage.setItem('token', res.access_token);
        }

        if (res.usuario) {

          localStorage.setItem(
            'usuario',
            JSON.stringify(res.usuario)
          );

          this.currentUser.set(res.usuario);
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
  // USUARIO
  // ============================

  getUserFromStorage() {

    const user = localStorage.getItem('usuario');

    if (!user) return null;

    return JSON.parse(user);

  }

  // ============================
  // ROL
  // ============================

  getRol(): string | null {

    const user = this.currentUser();

    if (!user) return null;

    return user.rol;

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
        Authorization: `Bearer ${token}`
      })
    };

  }

}
