import { Component, inject, effect } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Auth } from './services/auth';
import { WebSocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {

  private auth = inject(Auth);
  private ws = inject(WebSocketService);

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user?.id) {
        this.ws.unirseConductor(user.id);
      }
    });
  }
}
