import { Component, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';

import { addIcons } from 'ionicons';
import { 
  IonApp, IonMenu, IonHeader, IonContent, 
  IonList, IonItem, IonIcon, IonLabel, 
  IonToggle, IonMenuToggle, IonRouterOutlet,
  NavController, MenuController 
} from '@ionic/angular/standalone';
import { 
  gridOutline, cameraOutline, listOutline, 
  logOutOutline, globeOutline, peopleOutline,
  moonOutline, sunnyOutline, eyeOutline
} from 'ionicons/icons';

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { FirebaseService } from './services/firebase.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    IonApp, IonMenu, IonHeader, 
    IonContent, IonList, IonItem, IonIcon, 
    IonLabel, IonToggle, IonMenuToggle, IonRouterOutlet,
    NgClass
  ],

})
export class AppComponent {
  private navCtrl = inject(NavController);
  private menuCtrl = inject(MenuController);
  private firebaseSvc = inject(FirebaseService);

  darkMode = signal(false);

  // Iconos para enlace directo (más robusto en Standalone)
  public icons = {
    gridOutline, cameraOutline, listOutline, 
    logOutOutline, globeOutline, peopleOutline,
    moonOutline, sunnyOutline, eyeOutline
  };

  public appPages = [
    { title: 'Dashboard', url: '/dashboard', icon: gridOutline },
    { title: 'Cámara IA', url: '/camara', icon: cameraOutline },
    { title: 'Monitoreo', url: '/monitoreo', icon: eyeOutline },
    { title: 'Historial', url: '/historial', icon: listOutline }
  ];



  constructor() {
    addIcons({ 
      gridOutline, cameraOutline, listOutline, 
      logOutOutline, globeOutline, peopleOutline,
      moonOutline, sunnyOutline, eyeOutline
    });


    // Detectar preferencia del sistema inicialmente
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    this.darkMode.set(prefersDark.matches);
    this.applyTheme(prefersDark.matches);
  }

  async toggleTheme(event: any) {
    const isDark = event.detail.checked;
    this.darkMode.set(isDark);
    this.applyTheme(isDark);
    await Haptics.impact({ style: ImpactStyle.Light });
  }

  private applyTheme(isDark: boolean) {
    document.body.classList.toggle('ion-palette-dark', isDark);
  }

  async navigate(url: string) {
    console.log(`[DEBUG] Navigating to: ${url}`);
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      await this.menuCtrl.close(); // Cierra el menú al hacer clic
      this.navCtrl.navigateRoot(url);
    } catch (err) {
      console.error('[DEBUG] Navigation error:', err);
      // Fallback si falla el controlador de menú o haptics
      this.navCtrl.navigateRoot(url);
    }
  }

  async logout() {
    await Haptics.notification({ type: 'warning' as any });
    await this.menuCtrl.close();
    await this.firebaseSvc.signOut();
    this.navCtrl.navigateRoot('/login');
  }
}