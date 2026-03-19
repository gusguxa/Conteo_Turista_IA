import { Component, inject, signal } from '@angular/core';


import { FormsModule } from '@angular/forms';
import { 
  IonContent, IonIcon, IonInput, IonButton,
  LoadingController, ToastController, NavController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  analyticsOutline, fingerPrintOutline, mailOutline, 
  lockClosedOutline, personAddOutline, logInOutline, 
  personOutline, callOutline, calendarOutline, 
  chevronForwardOutline, eyeOutline, globeOutline, 
  peopleOutline, checkmarkCircleOutline 
} from 'ionicons/icons';
import { FirebaseService } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    FormsModule, IonContent, IonIcon, IonInput, IonButton
  ]

})
export class LoginPage {
  
  private firebaseSvc = inject(FirebaseService);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private navCtrl = inject(NavController);


  isLogin = signal(true);
  isLoading = signal(false);
  email = signal('');
  password = signal('');

  // Nuevos campos de perfil
  nombreCompleto = signal('');
  telefono = signal('');
  fechaNacimiento = signal('');

  public icons = {
    analyticsOutline, fingerPrintOutline, mailOutline, 
    lockClosedOutline, personAddOutline, logInOutline, 
    personOutline, callOutline, calendarOutline, 
    chevronForwardOutline, eyeOutline, globeOutline, 
    peopleOutline, checkmarkCircleOutline
  };

  constructor() {
    addIcons({ 
      analyticsOutline, 
      fingerPrintOutline, 
      mailOutline, 
      lockClosedOutline, 
      personAddOutline, 
      logInOutline,
      personOutline,
      callOutline,
      calendarOutline,
      chevronForwardOutline,
      eyeOutline,
      globeOutline,
      peopleOutline,
      checkmarkCircleOutline
    });
  }


  async toggleMode() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.isLogin.update(val => !val);
  }


  async handleAuth() {
    if (!this.email() || !this.password()) {
      this.showToast('Por favor, completa el correo y contraseña', 'warning');
      return;
    }

    if (!this.isLogin() && !this.nombreCompleto()) {
      this.showToast('El Nombre Completo es obligatorio para registrarse', 'warning');
      return;
    }

    await Haptics.notification({ type: 'success' as any });
    this.isLoading.set(true);
    
    const loading = await this.loadingCtrl.create({
      message: this.isLogin() ? 'Iniciando sesión...' : 'Creando cuenta...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      const { data, error } = this.isLogin() 
        ? await this.firebaseSvc.signIn(this.email(), this.password())
        : await this.firebaseSvc.signUp(
            this.email(), 
            this.password(),
            this.nombreCompleto(),
            this.telefono(),
            this.fechaNacimiento()
          );

      if (error) throw error;

      if (this.isLogin()) {
        this.showToast('¡Bienvenido!', 'success');
        this.navCtrl.navigateRoot('/dashboard');
      } else {
        await Haptics.notification({ type: 'success' as any });
        this.showToast('Cuenta creada exitosamente. Ya puedes iniciar sesión.', 'success');
        this.isLogin.set(true);
      }
    } catch (error: any) {
      await Haptics.notification({ type: 'error' as any });
      
      let message = error.message || 'Error en la autenticación';
      if (message.includes('auth/user-not-found')) {
        message = 'Usuario no encontrado.';
      } else if (message.includes('auth/wrong-password')) {
        message = 'Contraseña incorrecta.';
      }

      this.showToast(message, 'danger');
    } finally {
      this.isLoading.set(false);
      await loading.dismiss();
    }
  }


  
  async showToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}