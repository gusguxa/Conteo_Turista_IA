import { Component, OnInit, inject, signal } from '@angular/core';


import { FormsModule } from '@angular/forms';
import { 
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, 
  IonButton, IonContent, IonList, IonItem, IonLabel, IonAvatar, 
  IonSpinner, NavController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  personCircleOutline, mailOutline, callOutline, calendarOutline, 
  logOutOutline, chevronBackOutline 
} from 'ionicons/icons';
import { FirebaseService, UserProfile } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, 
    IonButton, IonContent, IonList, IonItem, IonLabel, IonAvatar, IonSpinner
  ]

})
export class PerfilPage implements OnInit {
  private firebaseSvc = inject(FirebaseService);
  private navCtrl = inject(NavController);

  isLoading = signal(true);
  userData = signal<UserProfile | null>(null);
  userEmail = signal('');

  constructor() { 
    addIcons({ personCircleOutline, mailOutline, callOutline, calendarOutline, logOutOutline, chevronBackOutline });
  }

  async ngOnInit() {
    await this.cargarDatosUsuario();
  }

  async cargarDatosUsuario() {
    this.isLoading.set(true);
    try {
      const user = this.firebaseSvc.currentUser;
      if (user) {
        this.userEmail.set(user.email || '');
        
        const { data: perfilInfo } = await this.firebaseSvc.getPerfilUsuario(user.uid);
        if (perfilInfo) {
          this.userData.set(perfilInfo);
        }
      }
    } catch (e) {
      console.error('Error cargando perfil:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async goBack() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.navCtrl.back();
  }

  async cerrarSesion() {
    await Haptics.impact({ style: ImpactStyle.Medium });
    await this.firebaseSvc.signOut();
    this.navCtrl.navigateRoot('/login');
  }
}

