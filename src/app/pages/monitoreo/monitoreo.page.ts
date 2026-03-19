import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { DatePipe, NgClass, UpperCasePipe } from '@angular/common';

import { 
  IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, 
  IonButton, IonContent, IonList, IonItem, IonLabel, IonBadge,
  IonSpinner, IonRefresher, IonRefresherContent, IonFab, IonFabButton, NavController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  videocamOutline, eyeOutline, refreshOutline, 
  chevronBackOutline, people, pulseOutline,
  closeCircleOutline
} from 'ionicons/icons';
import { FirebaseService, SesionStreaming } from '../../services/firebase.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Inteligencia Artificial
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

@Component({
  selector: 'app-monitoreo',
  templateUrl: './monitoreo.page.html',
  styleUrls: ['./monitoreo.page.scss'],
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonIcon, 
    IonButton, IonBadge, IonContent, IonRefresher, IonRefresherContent, 
    IonFab, IonFabButton, IonSpinner,
    DatePipe, NgClass, UpperCasePipe
  ]
})
export class MonitoreoPage implements OnInit, OnDestroy {
  private firebaseSvc = inject(FirebaseService);
  private navCtrl = inject(NavController);

  sessions = signal<SesionStreaming[]>([]);
  isLoading = signal(true);
  selectedSessionId = signal<string | null>(null);
  isDetecting = signal(false);

  // WebRTC
  private peerConnection: RTCPeerConnection | null = null;
  remoteStream = signal<MediaStream | null>(null);
  private iceCandidateQueue: any[] = [];

  // IA
  private model!: cocoSsd.ObjectDetection;
  private animationFrameId!: number;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChild('remoteVideo') remoteVideoElement!: ElementRef<HTMLVideoElement>;

  private iceServers = {
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ],
    iceCandidatePoolSize: 10
  };

  constructor() {
    addIcons({ 
      videocamOutline, eyeOutline, refreshOutline, 
      chevronBackOutline, people, pulseOutline,
      closeCircleOutline
    });
  }

  async ngOnInit() {
    await this.loadSessions();
    await this.loadModel();
  }

  ngOnDestroy() {
    this.closeConnection();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  async loadModel() {
    try {
      this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
      console.log('[AI Viewer] Modelo cargado');
    } catch (e) {
      console.error('[AI Viewer] Error cargando modelo:', e);
    }
  }

  async loadSessions() {
    this.isLoading.set(true);
    const { data, error } = await this.firebaseSvc.obtenerSesionesActivas();
    if (data) this.sessions.set(data);
    this.isLoading.set(false);
  }

  async handleRefresh(event: any) {
    await this.loadSessions();
    event.target.complete();
  }

  getActiveSession() {
    return this.sessions().find(s => s.id === this.selectedSessionId());
  }

  async viewSession(session: SesionStreaming) {
    if (this.selectedSessionId() === session.id) return;
    
    this.closeConnection();
    this.selectedSessionId.set(session.id);
    await Haptics.impact({ style: ImpactStyle.Medium });

    try {
      this.peerConnection = new RTCPeerConnection(this.iceServers);
      this.iceCandidateQueue = [];

      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC Viewer] Connection State:', this.peerConnection?.connectionState);
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('[WebRTC Viewer] ICE Connection State:', this.peerConnection?.iceConnectionState);
      };

      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC Viewer] Track recibido');
        const stream = event.streams[0];
        this.remoteStream.set(stream);
        
        // Asignación directa y forzar reproducción
        if (this.remoteVideoElement) {
          const video = this.remoteVideoElement.nativeElement;
          video.srcObject = stream;
          video.play().catch(e => console.warn('[WebRTC Viewer] Autoplay prevenido:', e));
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.firebaseSvc.agregarCandidatoRespuesta(session.id, event.candidate.toJSON());
        }
      };

      if (!session.offer) throw new Error('No offer found in session');
      const offerDescription = new RTCSessionDescription(session.offer);
      await this.peerConnection.setRemoteDescription(offerDescription);

      this.iceCandidateQueue.forEach(candidate => {
        this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(e => console.error('Error adding queued ICE candidate', e));
      });
      this.iceCandidateQueue = [];

      const answerDescription = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answerDescription);

      await this.firebaseSvc.responderSesionStreaming(session.id, {
        sdp: answerDescription.sdp,
        type: answerDescription.type
      });

      this.firebaseSvc.escucharCandidatosOferta(session.id, (candidateData) => {
        if (this.peerConnection?.remoteDescription) {
          this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => {});
        } else {
          this.iceCandidateQueue.push(candidateData);
        }
      });

    } catch (e) {
      console.error('Error visualizando sesión:', e);
      this.closeConnection();
    }
  }

  onVideoLoaded(event: any) {
    const video = event.target as HTMLVideoElement;
    console.log(`[AI Viewer] Video cargado: ${video.videoWidth}x${video.videoHeight}`);
    
    if (video.videoWidth > 0) {
      this.isDetecting.set(true);
      this.startDetectionLoop();
    } else {
      console.warn('[AI Viewer] Video cargado pero con dimensiones 0');
    }
  }

  private startDetectionLoop() {
    const video = this.remoteVideoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');

    if (!ctx || !this.model) return;

    const detectLoop = async () => {
      if (!this.selectedSessionId() || !this.isDetecting()) return;

      if (video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const predictions = await this.model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        predictions.filter(p => p.class === 'person' && p.score > 0.5).forEach(person => {
          const [x, y, width, height] = person.bbox;
          
          // Estilo minimalista y premium
          ctx.strokeStyle = '#22c55e'; // Verde esmeralda
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]); // Línea punteada para "escaneo"
          ctx.strokeRect(x, y, width, height);
          ctx.setLineDash([]); // Reset

          // Esquinas resaltadas
          this.drawCorners(ctx, x, y, width, height);

          // Etiqueta
          ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
          ctx.fillRect(x, y - 25, 80, 25);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillText(`DETECTADO`, x + 5, y - 8);
        });
      }

      this.animationFrameId = requestAnimationFrame(detectLoop);
    };

    detectLoop();
  }

  private drawCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const lineLen = 20;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;

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

  convertToDate(creado_at: any): any {
    if (!creado_at) return null;
    return creado_at.toDate ? creado_at.toDate() : creado_at;
  }

  goBack() {
    this.navCtrl.back();
  }

  closeConnection() {
    this.isDetecting.set(false);
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.iceCandidateQueue = [];
    this.remoteStream.set(null);
    this.selectedSessionId.set(null);
  }
}
