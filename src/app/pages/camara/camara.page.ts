import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject, signal } from '@angular/core';
import { UpperCasePipe, DecimalPipe, NgClass } from '@angular/common';

import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, IonButton,
  IonBadge, IonContent, IonRefresher, IonRefresherContent, IonFab,
  IonFabButton, IonSkeletonText, NavController,
  ToastController, ModalController, Platform
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  notificationsOutline, videocamOutline, logInOutline, speedometerOutline,
  alertCircleOutline, people, addCircleOutline, removeCircleOutline,
  wifiOutline, stopCircleOutline, playCircleOutline
} from 'ionicons/icons';

import { FirebaseService, PuntoTuristico, Notificacion } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NotificationsModalComponent } from '../dashboard/dashboard.page';

// Inteligencia Artificial
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

@Component({
  selector: 'app-camara',
  templateUrl: './camara.page.html',
  styleUrls: ['./camara.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, IonButton,
    IonBadge, IonContent, IonRefresher, IonRefresherContent, IonFab,
    IonFabButton, IonSkeletonText,
    UpperCasePipe, DecimalPipe, NgClass
  ]

})
export class CamaraPage implements OnInit, OnDestroy {
  private firebaseSvc = inject(FirebaseService);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private platform = inject(Platform);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  public stream!: MediaStream | null;

  // WebRTC
  private peerConnection: RTCPeerConnection | null = null;
  public isStreaming = signal(false);
  private currentSessionId: string | null = null;
  private iceServers = {
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ],
    iceCandidatePoolSize: 10
  };
  private iceCandidateQueue: RTCIceCandidateInit[] = [];


  // Modelo IA
  private model!: cocoSsd.ObjectDetection;
  private animationFrameId!: number;
  private isProcessing = false;

  // Estado de la página
  isLoading = signal(true);
  isCameraReady = signal(false);
  isDetecting = signal(false);
  locations = signal<PuntoTuristico[]>([]);
  selectedLocation = signal<PuntoTuristico | null>(null);
  userInitials = signal('AD');
  iaAccuracy = signal('---');
  entradasActuales = signal(0);
  cargaActual = signal(0);

  // Notificaciones
  notifications = signal<Notificacion[]>([]);
  unreadNotificationsCount = signal<number>(0);

  // --- IA Adaptativa ---
  confidenceThreshold = signal(0.5);   // Umbral que se calibra por ubicación
  avgConfidence = signal(0);
  totalDetections = signal(0);
  correctionsPositive = signal(0);
  correctionsNegative = signal(0);
  private calibrationInterval: any;
  private unsubscribeNotifs: any;

  // Tracking de personas entre frames
  private previousBlobs: { x: number; y: number; id: number; counted?: boolean }[] = [];
  private nextBlobId = 1;
  private countedIds = new Set<number>(); // Cooldown: IDs ya contados

  constructor() {
    addIcons({
      notificationsOutline, videocamOutline, logInOutline,
      speedometerOutline, alertCircleOutline, people,
      addCircleOutline, removeCircleOutline, wifiOutline,
      stopCircleOutline, playCircleOutline
    });
  }

  async ngOnInit() {
    await this.initAiModel();
    await this.loadLocations();
    await this.loadNotificaciones();
    this.initRealtimeNotifications();
  }

  ngOnDestroy() {
    this.stopStreaming();
    this.stopCamera();
    if (this.calibrationInterval) clearInterval(this.calibrationInterval);
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

      if (newNotif.tipo === 'ALERTA_CAPACIDAD') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        this.showToast(newNotif.mensaje, 'danger');
      }
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

  // --- Modelo IA ---
  async initAiModel() {
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
      console.log('Modelo COCO-SSD (mobilenet_v2) cargado exitosamente');
    } catch (e) {
      console.error('Error cargando modelo IA:', e);
    }
  }

  // --- Ubicaciones ---
  async loadLocations() {
    this.isLoading.set(true);
    const { data, error } = await this.firebaseSvc.getPuntosTuristicos();
    if (!error && data && data.length > 0) {
      this.locations.set(data);
      this.selectedLocation.set(data[0]);
      await this.loadCalibration(data[0].id);
    }
    this.isLoading.set(false);
    this.isCameraReady.set(true);
    this.startCamera();
  }

  async onLocationChange(event: any) {
    await Haptics.impact({ style: ImpactStyle.Medium });
    // Guardar calibración del punto anterior antes de cambiar
    await this.saveCalibration();

    const selectedId = event.target.value;
    const location = this.locations().find(loc => loc.id == selectedId);
    if (location) {
      this.selectedLocation.set(location);
      this.entradasActuales.set(0);
      this.cargaActual.set(0);
      this.previousBlobs = [];
      this.nextBlobId = 1;
      this.countedIds.clear();
      await this.loadCalibration(location.id);
    }
  }

  // --- Calibración IA por ubicación ---
  async loadCalibration(puntoId: string) {
    const { data } = await this.firebaseSvc.getCalibrationData(puntoId);
    if (data) {
      this.confidenceThreshold.set(data.umbral_confianza || 0.5);
      this.avgConfidence.set(data.confianza_promedio || 0);
      this.totalDetections.set(data.total_detecciones || 0);
      this.correctionsPositive.set(data.correcciones_positivas || 0);
      this.correctionsNegative.set(data.correcciones_negativas || 0);
      console.log(`Calibración cargada para punto ${puntoId}: umbral=${data.umbral_confianza}`);
    } else {
      // Valores por defecto para punto nuevo
      this.confidenceThreshold.set(0.5);
      this.avgConfidence.set(0);
      this.totalDetections.set(0);
      this.correctionsPositive.set(0);
      this.correctionsNegative.set(0);
    }

    // Auto-guardar calibración cada 60 segundos
    if (this.calibrationInterval) clearInterval(this.calibrationInterval);
    this.calibrationInterval = setInterval(() => this.saveCalibration(), 60000);
  }

  async saveCalibration() {
    const punto = this.selectedLocation();
    if (!punto) return;

    await this.firebaseSvc.saveCalibrationData(punto.id, {
      umbral_confianza: this.confidenceThreshold(),
      confianza_promedio: this.avgConfidence(),
      total_detecciones: this.totalDetections(),
      correcciones_positivas: this.correctionsPositive(),
      correcciones_negativas: this.correctionsNegative()
    });
  }

  // Corrección manual del usuario
  async correctCount(delta: number) {
    await Haptics.impact({ style: ImpactStyle.Medium });
    if (delta > 0) {
      this.correctionsPositive.update(v => v + 1);
      this.entradasActuales.update(v => v + 1);
      // Bajar umbral → más permisivo (detectó menos de lo real)
      this.confidenceThreshold.update(v => Math.max(0.2, v - 0.02));
      this.showToast('Corrección +1 aplicada. IA calibrada.', 'success');
    } else {
      this.correctionsNegative.update(v => v + 1);
      this.entradasActuales.update(v => Math.max(0, v - 1));
      // Subir umbral → más estricto (detectó falsos positivos)
      this.confidenceThreshold.update(v => Math.min(0.9, v + 0.02));
      this.showToast('Corrección -1 aplicada. IA calibrada.', 'warning');
    }

    // Registrar corrección en base de datos
    const loc = this.selectedLocation();
    if (loc) {
      this.firebaseSvc.registrarConteo(loc.id, delta > 0 ? 1 : 0, delta < 0 ? 1 : 0);
    }
  }

  async goToProfile() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.navCtrl.navigateForward('/perfil');
  }

  onVideoLoaded(event: any) {
    const video = event.target as HTMLVideoElement;
    console.log(`[Camera IA] Video cargado: ${video.videoWidth}x${video.videoHeight}`);
    if (video.videoWidth > 0) {
      if (!this.isDetecting()) {
        this.toggleDetection();
      }
    }
  }

  // --- Cámara ---
  async startCamera() {
    try {
      if (!window.isSecureContext && !this.platform.is('desktop')) {
        console.warn('No es SecureContext (HTTP detectado)');
      }

      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };

      if (navigator.mediaDevices?.getUserMedia) {
        if (!this.stream) {
          this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        }
      } else {
        this.showToast('Tu navegador no soporta el acceso a la cámara o requiere HTTPS', 'danger');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        this.showToast('Permiso de cámara denegado', 'danger');
      } else if (err.name === 'NotFoundError') {
        this.showToast('No se encontró ninguna cámara', 'danger');
      } else {
        this.showToast(`Error de cámara: ${err.message}`, 'danger');
      }
    }
  }

  private stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  // --- Conteo e IA Loop ---
  async toggleDetection() {
    await Haptics.impact({ style: ImpactStyle.Medium });
    if (this.isDetecting()) {
      this.isDetecting.set(false);
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    } else {
      this.isDetecting.set(true);
      this.startDetectionLoop();
    }
  }

  private async startDetectionLoop() {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');

    if (!ctx || !this.model) return;

    const detectFrame = async () => {
      if (!this.isDetecting()) return;

      if (video.readyState === 4) {
        // Ajustar canvas al video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Detección
        const predictions = await this.model.detect(video);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Procesar detecciones de personas
        const currentPeople = predictions.filter(p => p.class === 'person' && p.score > this.confidenceThreshold());
        
        // Actualizar precisión mostrada
        if (currentPeople.length > 0) {
          const avgScore = currentPeople.reduce((acc, p) => acc + p.score, 0) / currentPeople.length;
          this.iaAccuracy.set(`${(avgScore * 100).toFixed(1)}%`);
          this.avgConfidence.update(v => (v * 0.9) + (avgScore * 0.1));
          this.totalDetections.update(v => v + 1);
        }

        const currentBlobs: any[] = [];

        currentPeople.forEach(person => {
          const [x, y, width, height] = person.bbox;
          const centerX = x + width / 2;
          const centerY = y + height / 2;

          // Dibujar Bounding Box
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);
          
          // Dibujar esquinas (premium feel)
          this.drawCorners(ctx, x, y, width, height);

          // Lógica básica de conteo por tracking (basado en centroides)
          let matchedId = -1;
          let minDist = 50;

          this.previousBlobs.forEach(oldBlob => {
            const dist = Math.sqrt(Math.pow(centerX - oldBlob.x, 2) + Math.pow(centerY - oldBlob.y, 2));
            if (dist < minDist) {
              minDist = dist;
              matchedId = oldBlob.id;
            }
          });

          if (matchedId === -1) {
            matchedId = this.nextBlobId++;
            currentBlobs.push({ x: centerX, y: centerY, id: matchedId, counted: false });
          } else {
            const old = this.previousBlobs.find(b => b.id === matchedId);
            currentBlobs.push({ x: centerX, y: centerY, id: matchedId, counted: old?.counted || false });
          }

          // Si cruza el "umbral" imaginario (mitad de pantalla) y no ha sido contado
          const umbralY = canvas.height / 2;
          const blob = currentBlobs.find(b => b.id === matchedId);
          if (blob && !blob.counted && centerY > umbralY) {
            blob.counted = true;
            if (!this.countedIds.has(matchedId)) {
                this.countedIds.add(matchedId);
                this.zoneUpdateCount();
            }
          }
        });

        this.previousBlobs = currentBlobs;
        
        // Limpieza de cooldown (opcional)
        if (this.countedIds.size > 100) this.countedIds.clear();
      }

      this.animationFrameId = requestAnimationFrame(detectFrame);
    };

    detectFrame();
  }

  private drawCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const lineLen = 20;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 5;

    // Top Left
    ctx.beginPath();
    ctx.moveTo(x, y + lineLen); ctx.lineTo(x, y); ctx.lineTo(x + lineLen, y);
    ctx.stroke();

    // Top Right
    ctx.beginPath();
    ctx.moveTo(x + w - lineLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + lineLen);
    ctx.stroke();

    // Bottom Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - lineLen); ctx.lineTo(x, y + h); ctx.lineTo(x + lineLen, y + h);
    ctx.stroke();

    // Bottom Right
    ctx.beginPath();
    ctx.moveTo(x + w - lineLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - lineLen);
    ctx.stroke();
  }

  private async zoneUpdateCount() {
    await Haptics.impact({ style: ImpactStyle.Light });
    this.entradasActuales.update(v => v + 1);
    this.cargaActual.update(v => v + 1);
    
    // Registrar en BD
    const loc = this.selectedLocation();
    if (loc) {
      this.firebaseSvc.registrarConteo(loc.id, 1, 0);
    }
  }

  // --- Streaming ---
  async toggleStreaming(event?: any) {
    await Haptics.impact({ style: ImpactStyle.Medium });
    if (this.isStreaming()) {
      await this.stopStreaming();
    } else {
      await this.startStreaming();
    }
  }

  private async startStreaming() {
    if (!this.stream) {
      this.showToast('La cámara no está lista', 'warning');
      return;
    }

    try {
      this.isStreaming.set(true);
      this.peerConnection = new RTCPeerConnection(this.iceServers);

      // Add tracks
      this.stream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.stream!);
      });

      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC Broadcaster] Connection State:', this.peerConnection?.connectionState);
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.currentSessionId) {
          this.firebaseSvc.agregarCandidatoOferta(this.currentSessionId, event.candidate.toJSON());
        }
      };

      const offerDescription = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offerDescription);

      const loc = this.selectedLocation();
      if (!loc) throw new Error('No location selected');

      const user = this.firebaseSvc.currentUser;
      const { id, error } = await this.firebaseSvc.crearSesionStreaming(
        loc.id, loc.nombre, user?.email || 'Anon', 
        { sdp: offerDescription.sdp, type: offerDescription.type } as RTCSessionDescriptionInit
      );

      if (error || !id) throw error;
      this.currentSessionId = id;

      this.firebaseSvc.escucharRespuestaStreaming(id, async (answer) => {
        if (this.peerConnection && !this.peerConnection.currentRemoteDescription) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          
          this.iceCandidateQueue.forEach(candidate => {
            this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {});
          });
          this.iceCandidateQueue = [];
        }
      });

      this.firebaseSvc.escucharCandidatosRespuesta(id, (candidateData) => {
        if (this.peerConnection?.remoteDescription) {
          this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => {});
        } else {
          this.iceCandidateQueue.push(candidateData);
        }
      });

      this.showToast('Transmisión en vivo iniciada', 'success');
    } catch (e) {
      console.error('Error iniciando streaming:', e);
      this.isStreaming.set(false);
      this.showToast('Error al iniciar streaming', 'danger');
    }
  }

  private async stopStreaming() {
    if (this.currentSessionId) {
      await this.firebaseSvc.finalizarSesionStreaming(this.currentSessionId);
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.isStreaming.set(false);
    this.currentSessionId = null;
    this.iceCandidateQueue = [];
  }

  // --- UI Helpers ---
  async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
      mode: 'ios'
    });
    await toast.present();
  }

  async handleRefresh(event: any) {
    await this.loadLocations();
    event.target.complete();
  }
}