import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, 
  IonButton, IonBadge, IonContent, IonRefresher, IonRefresherContent, 
  IonList, IonItem, IonLabel, IonSearchbar, IonSkeletonText,
  IonFab, IonFabButton, IonSpinner,
  NavController, ToastController, ModalController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  receiptOutline, notificationsOutline, downloadOutline, 
  documentTextOutline, searchOutline, chevronForwardOutline, people
} from 'ionicons/icons';
import { FirebaseService, PuntoTuristico, Notificacion } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NotificationsModalComponent } from '../dashboard/dashboard.page';

export interface HistoryRecord {
  id: string;
  punto: string;
  ubicacion: string;
  fecha: string;
  hora: string;
  afluencia: number;
}

@Component({
  selector: 'app-historial',
  templateUrl: './historial.page.html',
  styleUrls: ['./historial.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, 
    IonButton, IonBadge, IonContent, IonRefresher, IonRefresherContent, 
    IonFab, IonFabButton, IonSpinner,
    IonList, IonItem, IonLabel, IonSearchbar, IonSkeletonText,
    DatePipe, UpperCasePipe
  ]
})
export class HistorialPage implements OnInit, OnDestroy {
  private firebaseSvc = inject(FirebaseService);
  private toastCtrl = inject(ToastController);
  private navCtrl = inject(NavController);
  private modalCtrl = inject(ModalController);

  isLoading = signal(true);
  searchQuery = signal(''); 
  allRecords = signal<HistoryRecord[]>([]); 
  userInitials = signal('ER');
  
  notifications = signal<Notificacion[]>([]);
  unreadNotificationsCount = signal(0);
  private unsubscribeNotifs: any;
  
  // Lógica de búsqueda automática
  filteredRecords = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.allRecords();
    return this.allRecords().filter(r => 
      r.punto.toLowerCase().includes(query) || 
      r.ubicacion.toLowerCase().includes(query)
    );
  });

  constructor() {
    addIcons({ 
      receiptOutline, notificationsOutline, downloadOutline, 
      documentTextOutline, searchOutline, chevronForwardOutline, people
    });
  }

  async ngOnInit() {
    await this.loadUserProfile();
    await this.loadHistory();
    this.loadNotificaciones();
    this.initRealtimeNotifications();
  }

  ngOnDestroy() {
    if (this.unsubscribeNotifs) this.unsubscribeNotifs();
  }

  async loadNotificaciones() {
    const { data } = await this.firebaseSvc.getNotificaciones();
    if (data) {
      this.notifications.set(data);
      this.unreadNotificationsCount.set(data.filter(n => !n.leida).length);
    }
  }

  private initRealtimeNotifications() {
    this.unsubscribeNotifs = this.firebaseSvc.subscribeToNotifications(async (newNotif) => {
      this.notifications.update(list => [newNotif, ...list]);
      this.unreadNotificationsCount.update(c => c + 1);
    });
  }

  async openNotifications() {
    await Haptics.impact({ style: ImpactStyle.Medium });
    const modal = await this.modalCtrl.create({
      component: NotificationsModalComponent,
      componentProps: { notifications: this.notifications() },
      breakpoints: [0, 0.5, 0.8],
      initialBreakpoint: 0.5,
      handle: true
    });
    await modal.present();
    await modal.onDidDismiss();
    this.unreadNotificationsCount.set(0);
  }

  async loadUserProfile() {
    const user = this.firebaseSvc.currentUser;
    if (user?.email) this.userInitials.set(user.email.substring(0, 2).toUpperCase());
  }

  async loadHistory() {
    this.isLoading.set(true);
    
    const [puntosRes, registrosRes] = await Promise.all([
      this.firebaseSvc.getPuntosTuristicos(),
      this.firebaseSvc.getHistorialCompleto()
    ]);

    const puntos = puntosRes.data || [];
    const registros = registrosRes.data || [];

    if (registros) {
      const formattedData: HistoryRecord[] = registros.map((item) => {
        const punto = puntos.find((p: PuntoTuristico) => p.id === item.punto_id);
        const createdAt = item.creado_at?.toDate ? item.creado_at.toDate() : new Date(item.creado_at as any);
        
        return {
          id: item.id,
          punto: punto?.nombre || 'Punto Desconocido',
          ubicacion: punto?.descripcion || 'Sin descripción',
          fecha: createdAt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
          hora: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          afluencia: (item.entradas || 0) + (item.salidas || 0) 
        };
      });
      this.allRecords.set(formattedData);
    }
    this.isLoading.set(false);
  }

  async handleRefresh(event: any) {
    await Haptics.impact({ style: ImpactStyle.Medium });
    await this.loadHistory();
    event.target.complete();
  }

  async exportGlobalCSV() {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    const data = this.allRecords();
    if (data.length === 0) {
      this.showToast('No hay datos para exportar', 'warning');
      return;
    }
    const headers = ['Punto', 'Ubicacion', 'Fecha', 'Hora', 'Afluencia'];
    const rows = data.map(r => [r.punto, `"${r.ubicacion}"`, r.fecha, r.hora, r.afluencia].join(','));
    this.downloadCSV(headers.join(',') + '\n' + rows.join('\n'), 'Historial_Completo.csv');
    this.showToast('Reporte generado correctamente', 'success');
  }

  async exportRow(record: HistoryRecord) {
    await Haptics.impact({ style: ImpactStyle.Light });
    const content = `Punto,${record.punto}\nFecha,${record.fecha}\nHora,${record.hora}\nAfluencia,${record.afluencia}`;
    this.downloadCSV(content, `Registro_${record.punto}.csv`);
    this.showToast('Descargando registro...', 'primary');
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'bottom' });
    await toast.present();
  }

  private downloadCSV(content: string, fileName: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    link.click();
  }

  async goToProfile() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.navCtrl.navigateForward('/perfil');
  }
}