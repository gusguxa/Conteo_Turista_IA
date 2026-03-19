import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  get supabaseClient() {
    return this.supabase;
  }

  constructor() {
    const env = environment as any;
    
    let url = env.supabaseUrl;
    let key = env.supabaseKey;

    if (!url) {
      url = 'https://cnzxqmxhwypuboqrbplv.supabase.co';
      key = 'sb_publishable_o720DV7a2OGFyOr_6hqNFQ_Tl-x5Djc';
    }

    this.supabase = createClient(url, key);
    console.log('inicio correctamente');
  }

  // Obtener historial completo con unión de tablas
  async getHistorialCompleto() {
    try {
      const { data, error } = await this.supabase
        .from('registros_conteo')
        .select(`
          id, 
          entradas, 
          salidas, 
          total_neto, 
          creado_at,
          puntos_turisticos ( nombre, descripcion )
        `)
        .order('creado_at', { ascending: false });
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Obtener puntos turísticos
  async getPuntosTuristicos() {
    try {
      const { data, error } = await this.supabase
        .from('puntos_turisticos')
        .select('*');
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Obtener los registros de conteo filtrados por tiempo
  async getRegistrosFiltrados(rangoDias: number) {
    const fechaLimite = new Date();
    // Para "Hoy" (rangoDias = 1), queremos los registros desde el inicio de hoy
    // Para "Semana" y "Mes", restamos los días manteniendo la hora actual (o inicio del día)
    
    if (rangoDias === 1) {
      // Si es "Hoy", fijar a las 00:00:00 de hoy
      fechaLimite.setHours(0, 0, 0, 0);
    } else {
      // Si es semana o mes, restar los días
      fechaLimite.setDate(fechaLimite.getDate() - rangoDias);
    }
    
    const fechaIso = fechaLimite.toISOString();

    try {
      // OJO: faltaba el "await" en la cadena antes de devolver!
      // En la versión anterior guardábamos en const pero no usábamos la respuesta porque faltaba await en el select/gte completo de otra manera
      const { data, error } = await this.supabase
        .from('registros_conteo')
        .select('punto_id, entradas, salidas, total_neto, creado_at')
        .gte('creado_at', fechaIso);
        
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Registrar un nuevo conteo
  async registrarConteo(puntoId: string, entradas: number, salidas: number) {
    try {
      const { data, error } = await this.supabase
        .from('registros_conteo')
        .insert([
          { 
            punto_id: puntoId, 
            entradas: entradas, 
            salidas: salidas,
            creado_at: new Date().toISOString()
          }
        ]);
      return { data, error };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  // iniciar sesion
  async signIn(email: string, pass: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: email,
      password: pass,
    });
    return { data, error };
  }

  // registrarse con datos de perfil
  async signUp(email: string, pass: string, nombreCompleto: string, telefono: string, fechaNacimiento: string) {
    // 1. Crear el usuario en auth.users
    const { data, error } = await this.supabase.auth.signUp({
      email: email,
      password: pass,
    });
    
    // 2. Si hay error en la creación base, lo devolvemos
    if (error) return { data, error };

    // 3. Si se creó exitosamente, insertamos el perfil en la tabla pública
    if (data.user) {
      const { error: profileError } = await this.supabase
        .from('perfiles')
        .insert([
          { 
            id: data.user.id, 
            nombre_completo: nombreCompleto,
            telefono: telefono || null,
            fecha_nacimiento: fechaNacimiento || null
          }
        ]);
        
      if (profileError) {
        console.error('Error creando el perfil:', profileError);
        // Nota: El usuario de autenticación ya se creó, pero falló el perfil.
        // En un entorno de producción se manejaría con transacciones o rpc.
      }
    }

    return { data, error };
  }

  // Obtener datos del perfil del usuario
  async getPerfilUsuario(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from('perfiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // cerrar sesión
  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    return { error };
  }
  // Obtener notificaciones
  async getNotificaciones() {
    try {
      const { data, error } = await this.supabase
        .from('notificaciones')
        .select(`
          *,
          puntos_turisticos ( nombre )
        `)
        .order('creado_at', { ascending: false })
        .limit(10);
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Marcar notificación como leída
  async marcarNotificacionLeida(id: string) {
    const { data, error } = await this.supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id);
    return { data, error };
  }

  // Escuchar notificaciones en tiempo real
  subscribeToNotifications(callback: (payload: any) => void) {
    if (!this.supabase) return null;
    
    return this.supabase
      .channel('notificaciones-alerta')
      .on(
        'postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notificaciones' }, 
        callback
      )
      .subscribe();
  }

  // --- IA Adaptativa: Calibración por punto turístico ---

  // Obtener parámetros de calibración IA de un punto
  async getCalibrationData(puntoId: string) {
    try {
      const { data, error } = await this.supabase
        .from('calibracion_ia')
        .select('*')
        .eq('punto_id', puntoId)
        .single();
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // Guardar o actualizar calibración IA
  async saveCalibrationData(puntoId: string, calibration: {
    umbral_confianza: number;
    confianza_promedio: number;
    total_detecciones: number;
    correcciones_positivas: number;
    correcciones_negativas: number;
  }) {
    const { data, error } = await this.supabase
      .from('calibracion_ia')
      .upsert({
        punto_id: puntoId,
        ...calibration,
        actualizado_at: new Date().toISOString()
      }, { onConflict: 'punto_id' });
    return { data, error };
  }
}