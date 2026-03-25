import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonIcon, IonButton, IonBadge, IonContent, IonRefresher, IonRefresherContent, 
  IonList, IonItem, IonLabel, IonSkeletonText, IonSelect, IonSelectOption,
  IonFab, IonFabButton, IonSpinner, IonSegment, IonSegmentButton,
  NavController, ToastController, ModalController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  receiptOutline, notificationsOutline, downloadOutline, 
  documentTextOutline, searchOutline, chevronForwardOutline, people, locationOutline
} from 'ionicons/icons';
import { FirebaseService, PuntoTuristico, Notificacion } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NotificationsModalComponent } from '../dashboard/dashboard.page';
import { HeaderComponent } from '../../header/header.component';

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
    IonIcon, IonButton, IonBadge, IonContent, IonRefresher, IonRefresherContent, 
    IonFab, IonFabButton, IonSpinner, IonList, IonItem, IonLabel, IonSelect, IonSelectOption,
    IonSkeletonText, IonSegment, IonSegmentButton,
    DatePipe, UpperCasePipe,
    HeaderComponent
  ]
})
export class HistorialPage implements OnInit, OnDestroy {
  private firebaseSvc = inject(FirebaseService);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);

  isLoading = signal(true);
  
  // Filtros
  filtroPeriodo = signal<'dia' | 'semana' | 'mes' | 'año' | 'todo'>('todo');
  selectedPunto = signal<string>('todos');
  
  puntosDeControl = signal<PuntoTuristico[]>([]);
  allRecords = signal<HistoryRecord[]>([]); 
  
  notifications = signal<Notificacion[]>([]);
  unreadNotificationsCount = signal(0);
  private unsubscribeNotifs: any;
  
  // LOGICA DE CONSOLIDACION DE DATOS
  displayRecords = computed(() => {
    const raw = this.allRecords();
    const periodo = this.filtroPeriodo();
    
    // Si queremos ver "todo" o no hay datos, mostramos la lista normal
    if (periodo === 'todo' || raw.length === 0) return raw;

    // Sumar toda la afluencia de los registros filtrados
    const total = raw.reduce((acc, curr) => acc + curr.afluencia, 0);
    const first = raw[0];
    const hoy = new Date();
    
    let labelFecha = '';
    let labelPeriodo = '';

    if (periodo === 'dia') {
      labelFecha = hoy.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      labelPeriodo = 'TOTAL HOY HRS';
    } else if (periodo === 'semana') {
      const diffLunes = hoy.getDay() === 0 ? -6 : 1 - hoy.getDay();
      const lunes = new Date(hoy); 
      lunes.setDate(hoy.getDate() + diffLunes);
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);
      labelFecha = `${lunes.getDate()} al ${domingo.getDate()} ${lunes.toLocaleDateString('es-MX', {month:'short'})}`;
      labelPeriodo = 'RESUMEN SEMANAL';
    } else if (periodo === 'mes') {
      labelFecha = hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).toUpperCase();
      labelPeriodo = 'RESUMEN MENSUAL';
    } else if (periodo === 'año') {
      labelFecha = hoy.getFullYear().toString();
      labelPeriodo = 'RESUMEN ANUAL';
    }

    // Devolvemos un solo objeto (una fila) con el gran total
    return [{
      id: 'summary',
      punto: this.selectedPunto() === 'todos' ? 'Múltiples Puntos' : first.punto,
      ubicacion: first.ubicacion,
      fecha: labelFecha,
      hora: labelPeriodo,
      afluencia: total
    }];
  });

  constructor() {
    addIcons({ 
      receiptOutline, notificationsOutline, downloadOutline, 
      documentTextOutline, searchOutline, chevronForwardOutline, people, locationOutline
    });
  }

  async ngOnInit() {
    await this.cargarPuntosDeControl();
    await this.loadHistory();
    this.loadNotificaciones();
    this.initRealtimeNotifications();
  }

  ngOnDestroy() {
    if (this.unsubscribeNotifs) this.unsubscribeNotifs();
  }

  async cargarPuntosDeControl() {
    const res = await this.firebaseSvc.getPuntosTuristicos();
    if (res.data) {
      this.puntosDeControl.set(res.data);
    }
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

  async cambiarPeriodo(event: any) {
    this.filtroPeriodo.set(event.detail.value);
    await this.loadHistory();
  }

  async cambiarPunto(event: any) {
    this.selectedPunto.set(event.detail.value);
    await this.loadHistory();
  }

  async loadHistory() {
    this.isLoading.set(true);
    
    const periodo = this.filtroPeriodo() as 'dia' | 'semana' | 'mes' | 'año' | 'todo';
    const puntoId = this.selectedPunto();

    const registrosRes = await this.firebaseSvc.getRegistrosPorPeriodoYPunto(periodo, puntoId);
    const registros = registrosRes.data || [];
    const puntos = this.puntosDeControl();

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

  async exportGlobalCSV() {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    const data = this.allRecords();
    if (data.length === 0) {
      this.showToast('No hay datos para exportar', 'warning');
      return;
    }

    let nombrePuntoStr = 'TodosLosPuntos';
    if (this.selectedPunto() !== 'todos') {
      const p = this.puntosDeControl().find(x => x.id === this.selectedPunto());
      if (p) nombrePuntoStr = p.nombre.replace(/\s+/g, '_');
    }

    const headers = ['Punto', 'Ubicacion', 'Fecha', 'Hora', 'Afluencia'];
    const rows = data.map(r => [r.punto, `"${r.ubicacion}"`, r.fecha, r.hora, r.afluencia].join(','));
    
    const fileName = `Reporte_${nombrePuntoStr}_${this.filtroPeriodo().toUpperCase()}.csv`;
    this.downloadCSV(headers.join(',') + '\n' + rows.join('\n'), fileName);
    this.showToast('Reporte generado correctamente', 'success');
  }

  async exportRow(record: HistoryRecord) {
    await Haptics.impact({ style: ImpactStyle.Light });
    let content = '';
    let fileName = '';

    // Si le da descargar a la fila de resumen, le descargamos TODOS los registros que conforman ese resumen
    if (record.id === 'summary') {
      const data = this.allRecords();
      const headers = ['Punto', 'Ubicacion', 'Fecha', 'Hora', 'Afluencia'];
      const rows = data.map(r => [r.punto, `"${r.ubicacion}"`, r.fecha, r.hora, r.afluencia].join(','));
      content = headers.join(',') + '\n' + rows.join('\n');
      fileName = `Desglose_${this.filtroPeriodo().toUpperCase()}.csv`;
      this.showToast('Descargando desglose completo...', 'primary');
    } else {
      content = `Punto,${record.punto}\nFecha,${record.fecha}\nHora,${record.hora}\nAfluencia,${record.afluencia}`;
      fileName = `Registro_${record.punto}.csv`;
      this.showToast('Descargando registro...', 'primary');
    }

    this.downloadCSV(content, fileName);
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
}