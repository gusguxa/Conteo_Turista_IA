import { Component, OnInit, OnDestroy, AfterViewInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';

import { 
  IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, 
  IonButton, IonBadge, IonContent, IonSpinner, IonList, IonItem, 
  IonLabel, IonFab, IonFabButton, NavController, 
  ToastController, ModalController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  notificationsOutline, menuOutline, pieChartOutline, analyticsOutline, 
  sparklesOutline, calendarOutline, timeOutline, peopleOutline, 
  statsChartOutline, closeCircleOutline, alertCircleOutline, 
  informationCircle, notificationsOffOutline, people, mapOutline, eyeOutline, chevronForwardOutline
} from 'ionicons/icons';


import { FirebaseService, PuntoTuristico, Notificacion, RegistroConteo } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { 
  NgApexchartsModule, 
  ApexChart, 
  ApexNonAxisChartSeries, 
  ApexPlotOptions, 
  ApexDataLabels, 
  ApexLegend, 
  ApexStroke 
} from 'ng-apexcharts';
import { Input } from '@angular/core';
import * as L from 'leaflet';

export interface DashboardLocation extends PuntoTuristico {
  totalVisitantes: number;
  porcentajeOcupacion: number;
  identityColor: string;
  porcentajeDistribucion: number;
}

export interface DashboardInsight {
  bestDay: string;
  peakHour: string;
  totalPeriod: number;
  message: string;
}

@Component({
  selector: 'app-notifications-modal',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Historial de Alertas</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cerrar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list lines="full">
        @for (notif of notifications; track notif.id) {
          <ion-item [class.unread]="!notif.leida">
            <ion-icon slot="start" 
                      [name]="notif.tipo === 'ALERTA_CAPACIDAD' ? 'alert-circle' : 'information-circle'" 
                      [color]="notif.tipo === 'ALERTA_CAPACIDAD' ? 'danger' : 'primary'">
            </ion-icon>
            <ion-label>
              <h3>{{ notif.mensaje }}</h3>
              <p>{{ convertToDate(notif.creado_at) | date:'shortTime' }}</p>
            </ion-label>
          </ion-item>
        } @empty {
          <div class="empty-state">
            <ion-icon name="notifications-off-outline"></ion-icon>
            <p>No hay notificaciones recientes</p>
          </div>
        }
      </ion-list>
    </ion-content>
  `,
  styles: [`
    .unread { --background: rgba(var(--ion-color-primary-rgb), 0.05); }
    .empty-state { text-align: center; margin-top: 50px; color: var(--ion-color-step-400); }
    .empty-state ion-icon { font-size: 64px; }
  `],
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonIcon, 
    IonButton, IonBadge, IonContent, IonSpinner, IonList, IonItem, 
    IonLabel, IonFab, IonFabButton, 
    DatePipe, DecimalPipe, NgClass, NgApexchartsModule
  ]
})
export class NotificationsModalComponent {
  private modalCtrl = inject(ModalController);
  @Input() notifications: Notificacion[] = [];

  convertToDate(creado_at: any): any {
    if (!creado_at) return null;
    return creado_at.toDate ? creado_at.toDate() : creado_at;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}

// Definimos la interfaz para que TypeScript no se queje
export type ChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  stroke: ApexStroke;
};

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    NgApexchartsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, 
    IonButton, IonBadge, IonContent, IonSpinner, IonFab, IonFabButton,
    IonList, IonItem, IonLabel,
    DatePipe, DecimalPipe, NgClass
  ]
})
export class DashboardPage implements OnInit, OnDestroy, AfterViewInit {
  private firebaseSvc = inject(FirebaseService);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);

  // Mapa Leaflet
  private map: L.Map | null = null;
  private mapMarkers: L.CircleMarker[] = [];

  isLoading = signal(true);
  locations = signal<DashboardLocation[]>([]);
  notifications = signal<Notificacion[]>([]); 
  unreadNotificationsCount = signal(0);
  userInitials = signal('??');
  timeFilter = signal('Hoy');
  selectedLocationId = signal<string | null>(null);
  insights = signal<DashboardInsight | null>(null);

  public chartOptions: Partial<ChartOptions>;
  private lastRegistros: RegistroConteo[] = [];
  private refreshInterval: any;
  private unsubscribeNotifs: any;

  constructor() {
    addIcons({ 
      notificationsOutline, menuOutline, pieChartOutline, analyticsOutline, 
      sparklesOutline, calendarOutline, timeOutline, peopleOutline, statsChartOutline,
      closeCircleOutline, alertCircleOutline, informationCircle, notificationsOffOutline, 
      people, mapOutline, eyeOutline, chevronForwardOutline
    });

    this.chartOptions = {
      chart: { 
        type: 'donut' as const, 
        height: 380, 
        fontFamily: 'inherit', 
        background: 'transparent',
        animations: {
          enabled: true,
          speed: 800,
          animateGradually: { enabled: true, delay: 150 },
          dynamicAnimation: { enabled: true, speed: 350 }
        }
      },
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
      plotOptions: {
        pie: {
          donut: {
            size: '75%',
              labels: {
                show: true,
                name: { show: true, fontSize: '13px', fontFamily: 'Inter, sans-serif', color: '#64748b' },
                value: { show: true, fontSize: '32px', fontFamily: 'Inter, sans-serif', fontWeight: 800, color: '#0f172a' },
                total: { show: true, showAlways: true, label: 'TOTAL', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#64748b',
                  formatter: (w: any) => {
                    return w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0);
                  }
                }
              }
          }
        }
      },
      dataLabels: { enabled: false },
      legend: { 
        position: 'bottom', 
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        fontSize: '14px',
        markers: { size: 6 } 
      },
      series: [],
      labels: [],
      stroke: { show: true, colors: ['var(--app-card-bg)'], width: 3 }
    };
  }

  async ngOnInit() {
    await this.loadUserProfile();
    await this.loadNotificaciones();
    await this.loadDashboardData();
    this.startAutoRefresh();
    this.initRealtimeNotifications();
  }

  ngAfterViewInit() {
    setTimeout(() => this.initMap(), 300);
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
    if (this.unsubscribeNotifs) this.unsubscribeNotifs();
    if (this.map) { this.map.remove(); this.map = null; }
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.loadDashboardData(true); 
    }, 5000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  async loadUserProfile() {
    try {
      const user = this.firebaseSvc.currentUser;
      if (user?.email) {
        this.userInitials.set(user.email.substring(0, 2).toUpperCase());
      } else {
        this.userInitials.set('AD'); 
      }
    } catch (e) {
      this.userInitials.set('US');
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

      if (newNotif.tipo === 'ALERTA_CAPACIDAD') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        this.showPopupAlerta(newNotif.mensaje);
      }
    });
  }

  async showPopupAlerta(mensaje: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 5000,
      position: 'top',
      color: 'danger',
      buttons: [{ text: 'OK', role: 'cancel' }]
    });
    await toast.present();
  }

  private identityPalette = [
    '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  ];

  async loadDashboardData(silent = false) {
    if (!silent) this.isLoading.set(true);
    
    const { data: puntos, error: errorPuntos } = await this.firebaseSvc.getPuntosTuristicos();
    
    if (!errorPuntos && puntos) {
      let dias = 1; 
      if (this.timeFilter() === 'Semana') dias = 7;
      if (this.timeFilter() === 'Mes') dias = 30;

      const { data: registros } = await this.firebaseSvc.getRegistrosFiltrados(dias);
      this.lastRegistros = registros || [];

      if (this.lastRegistros.length > 0) {
        this.calculateInsights(this.lastRegistros);
      } else {
        this.insights.set(null);
      }

      const puntosCalculados: DashboardLocation[] = puntos.map((punto, index) => {
        const registrosDelLugar = this.lastRegistros.filter(r => r.punto_id === punto.id);
        const totalVisitantes = registrosDelLugar.reduce((suma, r) => suma + (r.entradas || 0), 0);
        const aforoActual = registrosDelLugar.length > 0 ? registrosDelLugar[0].total_neto || 0 : 0;
        
        let ocupacion = 0;
        if (punto.capacidad_maxima > 0) {
           ocupacion = Math.round((aforoActual / punto.capacidad_maxima) * 100);
           if (ocupacion > 100) ocupacion = 100;
           if (ocupacion < 0) ocupacion = 0;
        }

        return { 
          ...punto, 
          totalVisitantes, 
          porcentajeOcupacion: ocupacion, 
          identityColor: this.identityPalette[index % this.identityPalette.length],
          porcentajeDistribucion: 0
        };
      });

      const granTotal = puntosCalculados.reduce((acc, curr) => acc + curr.totalVisitantes, 0);
      puntosCalculados.forEach(p => {
        p.porcentajeDistribucion = granTotal > 0 ? Math.round((p.totalVisitantes / granTotal) * 100) : 0;
      });
      
      this.locations.set(puntosCalculados);
      this.updateChartColors();
      this.updateMapMarkers(puntosCalculados);
    }
    if (!silent) this.isLoading.set(false);
  }

  get activeInsightTitle(): string {
    const selectedId = this.selectedLocationId();
    if (!selectedId) return 'Análisis de Tendencias';
    const loc = this.locations().find(l => l.id === selectedId);
    return loc ? `Análisis de ${loc.nombre}` : 'Análisis de Tendencias';
  }

  async clearSelection() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.selectedLocationId.set(null);
    this.updateChartColors();
    if (this.lastRegistros.length > 0) this.calculateInsights(this.lastRegistros);
  }

  async selectLocation(id: string) {
    if (this.selectedLocationId() === id) {
      this.selectedLocationId.set(null);
    } else {
      await Haptics.impact({ style: ImpactStyle.Light });
      this.selectedLocationId.set(id);
    }
    this.updateChartColors();
    if (this.lastRegistros.length > 0) this.calculateInsights(this.lastRegistros);
  }

  private calculateInsights(registros: RegistroConteo[]) {
    const selectedId = this.selectedLocationId();
    const filteredRegistros = selectedId ? registros.filter(r => r.punto_id === selectedId) : registros;

    if (filteredRegistros.length === 0) {
      this.insights.set(null);
      return;
    }

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoursCount: Record<number, number> = {};
    const daysCount: Record<number, number> = {};
    let totalPeriod = 0;

    filteredRegistros.forEach(r => {
      const date = r.creado_at?.toDate ? r.creado_at.toDate() : new Date(r.creado_at as any);
      const day = date.getDay();
      const hour = date.getHours();
      const count = r.entradas || 0;

      daysCount[day] = (daysCount[day] || 0) + count;
      hoursCount[hour] = (hoursCount[hour] || 0) + count;
      totalPeriod += count;
    });

    let maxDay = 0, maxDayVal = -1;
    for (let d = 0; d < 7; d++) {
      if ((daysCount[d] || 0) > maxDayVal) {
        maxDayVal = daysCount[d] || 0;
        maxDay = d;
      }
    }

    let maxHour = 0, maxHourVal = -1;
    for (let h = 0; h < 24; h++) {
      if ((hoursCount[h] || 0) > maxHourVal) {
        maxHourVal = hoursCount[h] || 0;
        maxHour = h;
      }
    }

    const peakHourStr = `${maxHour}:00 ${maxHour >= 12 ? 'PM' : 'AM'}`;
    const bestDayStr = dayNames[maxDay];

    let message = `El ${bestDayStr.toLowerCase()} es el día con mayor afluencia este ${this.timeFilter().toLowerCase()}.`;
    if (maxDay === 0) message = `Los domingos son los días más concurridos, posiblemente por las actividades religiosas.`;

    if (selectedId) {
      const loc = this.locations().find(l => l.id === selectedId);
      message = `En ${loc?.nombre}, los ${bestDayStr.toLowerCase()}s a las ${peakHourStr} son el momento de mayor flujo.`;
    }

    this.insights.set({ bestDay: bestDayStr, peakHour: peakHourStr, totalPeriod, message });
  }

  async handleRefresh(event: any) {
    await Haptics.impact({ style: ImpactStyle.Light });
    await this.loadDashboardData();
    event.target.complete();
  }

  async setFilter(filter: string) {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.timeFilter.set(filter);
    await this.loadDashboardData(); 
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

  async goToProfile() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.navCtrl.navigateForward('/perfil');
  }

  async goToMonitoring() {
    await Haptics.impact({ style: ImpactStyle.Medium });
    this.navCtrl.navigateForward('/monitoreo');
  }

  private updateChartColors() {
    const selectedId = this.selectedLocationId();
    const allLocations = this.locations();
    if (allLocations.length === 0) return;

    const newColors = allLocations.map(p => (!selectedId || p.id === selectedId) ? p.identityColor : '#e2e8f0');
    const selectedLoc = allLocations.find(p => p.id === selectedId);
    const centerLabel = selectedLoc ? selectedLoc.nombre.substring(0, 15).toUpperCase() : 'TOTAL';

    this.chartOptions = {
      ...this.chartOptions,
      series: allLocations.map(p => p.totalVisitantes),
      labels: allLocations.map(p => p.nombre),
      colors: newColors,
      plotOptions: {
        ...this.chartOptions.plotOptions,
        pie: {
          ...this.chartOptions.plotOptions?.pie,
          donut: {
            ...this.chartOptions.plotOptions?.pie?.donut,
            labels: {
              ...this.chartOptions.plotOptions?.pie?.donut?.labels,
              total: {
                ...this.chartOptions.plotOptions?.pie?.donut?.labels?.total,
                label: centerLabel,
                formatter: (w: any) => {
                  if (selectedLoc) return selectedLoc.totalVisitantes;
                  return w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0);
                }
              }
            }
          }
        }
      }
    };
  }

  getProgressBarColor(pct: number, location: DashboardLocation): string {
    if (this.selectedLocationId() === location.id) return location.identityColor;
    if (pct < 50) return '#3b82f6';
    if (pct < 85) return '#10b981';
    return '#ef4444';
  }

  private initMap() {
    const mapContainer = document.getElementById('occupancy-map');
    if (!mapContainer || this.map) return;

    this.map = L.map('occupancy-map', {
      center: [21.8474, -102.7108],
      zoom: 13,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    setTimeout(() => this.map?.invalidateSize(), 400);
  }

  private updateMapMarkers(puntos: DashboardLocation[]) {
    if (!this.map) return;
    this.mapMarkers.forEach(m => m.remove());
    this.mapMarkers = [];

    const bounds: L.LatLngExpression[] = [];
    puntos.forEach(punto => {
      const lat = punto.latitud || 21.8474;
      const lng = punto.longitud || -102.7108;
      const pct = punto.porcentajeOcupacion || 0;

      let color = '#10b981'; 
      if (pct >= 50 && pct < 85) color = '#f59e0b'; 
      if (pct >= 85) color = '#ef4444'; 

      const marker = L.circleMarker([lat, lng], {
        radius: 14, fillColor: color, color: '#ffffff',
        weight: 3, opacity: 1, fillOpacity: 0.85
      }).addTo(this.map!);

      marker.bindPopup(`
        <div style="text-align:center;font-family:Inter,sans-serif;min-width:140px;">
          <strong style="font-size:14px;color:#0f172a;">${punto.nombre}</strong><br>
          <span style="font-size:22px;font-weight:800;color:${color};">${pct}%</span>
          <span style="font-size:11px;color:#64748b;display:block;">ocupación</span>
          <hr style="margin:6px 0;border-color:#e2e8f0;">
          <span style="font-size:13px;color:#334155;"><strong>${punto.totalVisitantes}</strong> visitantes</span>
        </div>
      `);

      this.mapMarkers.push(marker);
      bounds.push([lat, lng]);
    });

    if (bounds.length > 1) {
      this.map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [30, 30] });
    } else if (bounds.length === 1) {
      this.map.setView(bounds[0] as L.LatLngExpression, 14);
    }
  }
}