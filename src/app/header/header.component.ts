import { Component, Input, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { 
  IonHeader, IonToolbar, IonButtons, 
  IonMenuButton, IonIcon 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { receiptOutline, menuOutline } from 'ionicons/icons';
import { FirebaseService } from '../services/firebase.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, IonIcon]
})
export class HeaderComponent implements OnInit {
  // Recibimos el título dinámico (ej. 'HISTORIAL', 'DASHBOARD')
  @Input() title: string = '';

  private firebaseSvc = inject(FirebaseService);
  private router = inject(Router);

  public userName: string = '';
  public userInitials: string = '';

  constructor() {
    // Registramos los iconos que usa el header
    addIcons({ receiptOutline, menuOutline });
  }

  ngOnInit() {
    this.loadUserData();
  }

  async loadUserData() {
    const user = this.firebaseSvc.currentUser;
    if (user) {
      // Usamos tu servicio para traer el perfil real de Firestore
      const result = await this.firebaseSvc.getPerfilUsuario(user.uid);
      
      if (result.data && result.data.nombre_completo) {
        this.userName = result.data.nombre_completo;
      } else {
        // Fallback por si acaso
        this.userName = user.email || 'Usuario'; 
      }
      this.userInitials = this.getInitials(this.userName);
    }
  }

  // Función para sacar las iniciales del nombre
  getInitials(name: string): string {
    const parts = name.trim().split(' ');
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase(); // Si es "1", devuelve "1"
    return (parts[0][0] + parts[1][0]).toUpperCase(); // Si es "Juan Perez", devuelve "JP"
  }

  goToProfile() {
    this.router.navigate(['/perfil']);
  }
}