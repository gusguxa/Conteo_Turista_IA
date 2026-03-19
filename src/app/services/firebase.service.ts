import { Injectable, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { Firestore, collection, doc, getDocs, getDoc, setDoc, addDoc, query, where, orderBy, limit, updateDoc, onSnapshot, Timestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface UserProfile {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  fecha_nacimiento: string | null;
  creado_at: Timestamp;
}

export interface PuntoTuristico {
  id: string;
  nombre: string;
  descripcion: string;
  capacidad_maxima: number;
  latitud: number;
  longitud: number;
}

export interface RegistroConteo {
  id: string;
  punto_id: string;
  entradas: number;
  salidas: number;
  total_neto: number;
  creado_at: Timestamp;
}

export interface Notificacion {
  id: string;
  mensaje: string;
  tipo: string;
  leida: boolean;
  creado_at: Timestamp;
}

export interface CalibrationData {
  umbral_confianza: number;
  confianza_promedio: number;
  total_detecciones: number;
  correcciones_positivas: number;
  correcciones_negativas: number;
  actualizado_at?: Timestamp;
}

export interface SesionStreaming {
  id: string;
  punto_id: string;
  usuario_id: string;
  email: string;
  nombre_punto: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  creado_at: Timestamp;
  activa: boolean;
}


@Injectable({
  providedIn: 'root'
})

export class FirebaseService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private injector = inject(Injector);

  get currentUser() {
    return this.auth.currentUser;
  }

  constructor() {}

  // --- Autenticación ---

  async signIn(email: string, pass: string) {
    try {
      const result = await signInWithEmailAndPassword(this.auth, email, pass);
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async signUp(email: string, pass: string, nombreCompleto: string, telefono: string, fechaNacimiento: string) {
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, pass);
      if (result.user) {
        // Crear perfil en Firestore
        await setDoc(doc(this.firestore, 'perfiles', result.user.uid), {
          id: result.user.uid,
          nombre_completo: nombreCompleto,
          telefono: telefono || null,
          fecha_nacimiento: fechaNacimiento || null,
          creado_at: Timestamp.now()
        });
      }
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async signOut() {
    try {
      await signOut(this.auth);
      return { error: null };
    } catch (error) {
      return { error };
    }
  }

  async getPerfilUsuario(userId: string) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const docSnap = await getDoc(doc(this.firestore, 'perfiles', userId));
        return { data: docSnap.exists() ? (docSnap.data() as UserProfile) : null, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  // --- Base de Datos (Firestore) ---

  async getPuntosTuristicos() {
    return runInInjectionContext(this.injector, async () => {
      try {
        const querySnapshot = await getDocs(collection(this.firestore, 'puntos_turisticos'));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PuntoTuristico));
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  async getHistorialCompleto() {
    return runInInjectionContext(this.injector, async () => {
      try {
        const q = query(collection(this.firestore, 'registros_conteo'), orderBy('creado_at', 'desc'));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RegistroConteo));
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  async registrarConteo(puntoId: string, entradas: number, salidas: number) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const recordData = {
          punto_id: puntoId,
          entradas,
          salidas,
          total_neto: entradas - salidas,
          creado_at: Timestamp.now()
        };
        const docRef = await addDoc(collection(this.firestore, 'registros_conteo'), recordData);
        return { data: { id: docRef.id, ...recordData } as RegistroConteo, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  async getRegistrosFiltrados(rangoDias: number) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const fechaLimite = new Date();
        if (rangoDias === 1) {
          fechaLimite.setHours(0, 0, 0, 0);
        } else {
          fechaLimite.setDate(fechaLimite.getDate() - rangoDias);
        }
        
        const q = query(
          collection(this.firestore, 'registros_conteo'),
          where('creado_at', '>=', Timestamp.fromDate(fechaLimite)),
          orderBy('creado_at', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RegistroConteo));
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  // --- Notificaciones ---

  async getNotificaciones() {
    return runInInjectionContext(this.injector, async () => {
      try {
        const q = query(collection(this.firestore, 'notificaciones'), orderBy('creado_at', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notificacion));
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  async marcarNotificacionLeida(id: string) {
    return runInInjectionContext(this.injector, async () => {
      try {
        await updateDoc(doc(this.firestore, 'notificaciones', id), { leida: true });
        return { data: true, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  subscribeToNotifications(callback: (payload: Notificacion) => void) {
    return runInInjectionContext(this.injector, () => {
      const q = query(collection(this.firestore, 'notificaciones'), where('leida', '==', false));
      return onSnapshot(q, (snapshot) => {
        this.zone.run(() => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              callback({ id: change.doc.id, ...change.doc.data() } as Notificacion);
            }
          });
        });
      });
    });
  }


  // --- IA Adaptativa ---

  async getCalibrationData(puntoId: string) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const docSnap = await getDoc(doc(this.firestore, 'calibracion_ia', puntoId));
        return { data: docSnap.exists() ? (docSnap.data() as CalibrationData) : null, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }


  async saveCalibrationData(puntoId: string, calibration: Partial<CalibrationData>) {
    return runInInjectionContext(this.injector, async () => {
      try {
        await setDoc(doc(this.firestore, 'calibracion_ia', puntoId), {
          ...calibration,
          actualizado_at: Timestamp.now()
        }, { merge: true });
        return { data: true, error: null };
      } catch (error) {
        return { data: null, error };
      }
    });
  }

  // --- WebRTC Streaming (Señalización) ---

  async crearSesionStreaming(puntoId: string, nombrePunto: string, email: string, offer: RTCSessionDescriptionInit) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const sessionData = {
          punto_id: puntoId,
          nombre_punto: nombrePunto,
          email: email,
          usuario_id: this.currentUser?.uid || 'anon',
          offer: offer,
          activa: true,
          creado_at: Timestamp.now()
        };
        const docRef = await addDoc(collection(this.firestore, 'sesiones_vivo'), sessionData);
        return { id: docRef.id, error: null };
      } catch (error) {
        return { id: null, error };
      }
    });
  }

  async agregarCandidatoOferta(sessionId: string, candidate: RTCIceCandidateInit) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const candidatesCol = collection(this.firestore, `sesiones_vivo/${sessionId}/offerCandidates`);
        await addDoc(candidatesCol, candidate);
      } catch (e) {
        console.error('Error guardando candidato oferta:', e);
      }
    });
  }

  escucharRespuestaStreaming(sessionId: string, callback: (answer: RTCSessionDescriptionInit) => void) {
    return runInInjectionContext(this.injector, () => {
      return onSnapshot(doc(this.firestore, 'sesiones_vivo', sessionId), (snapshot) => {
        this.zone.run(() => {
          const data = snapshot.data();
          if (data && data['answer']) {
            callback(data['answer']);
          }
        });
      });
    });
  }

  escucharCandidatosRespuesta(sessionId: string, callback: (candidate: RTCIceCandidateInit) => void) {
    return runInInjectionContext(this.injector, () => {
      const q = collection(this.firestore, `sesiones_vivo/${sessionId}/answerCandidates`);
      return onSnapshot(q, (snapshot) => {
        this.zone.run(() => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              callback(change.doc.data() as RTCIceCandidateInit);
            }
          });
        });
      });
    });
  }

  async obtenerSesionesActivas() {
    return runInInjectionContext(this.injector, async () => {
      try {
        const q = query(
          collection(this.firestore, 'sesiones_vivo'),
          where('activa', '==', true),
          orderBy('creado_at', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SesionStreaming));
        return { data, error: null };
      } catch (error) {
        console.error('Error al obtener sesiones:', error);
        return { data: null, error };
      }
    });
  }


  async responderSesionStreaming(sessionId: string, answer: RTCSessionDescriptionInit) {
    return runInInjectionContext(this.injector, async () => {
      try {
        await updateDoc(doc(this.firestore, 'sesiones_vivo', sessionId), { answer });
        return { error: null };
      } catch (error) {
        return { error };
      }
    });
  }

  async agregarCandidatoRespuesta(sessionId: string, candidate: RTCIceCandidateInit) {
    return runInInjectionContext(this.injector, async () => {
      try {
        const candidatesCol = collection(this.firestore, `sesiones_vivo/${sessionId}/answerCandidates`);
        await addDoc(candidatesCol, candidate);
      } catch (e) {
        console.error('Error guardando candidato respuesta:', e);
      }
    });
  }

  escucharCandidatosOferta(sessionId: string, callback: (candidate: RTCIceCandidateInit) => void) {
    return runInInjectionContext(this.injector, () => {
      const q = collection(this.firestore, `sesiones_vivo/${sessionId}/offerCandidates`);
      return onSnapshot(q, (snapshot) => {
        this.zone.run(() => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              callback(change.doc.data() as RTCIceCandidateInit);
            }
          });
        });
      });
    });
  }

  async finalizarSesionStreaming(sessionId: string) {
    return runInInjectionContext(this.injector, async () => {
      try {
        await updateDoc(doc(this.firestore, 'sesiones_vivo', sessionId), { activa: false });
      } catch (e) {
        console.error('Error finalizando sesión:', e);
      }
    });
  }
}
