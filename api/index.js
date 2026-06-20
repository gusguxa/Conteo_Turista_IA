const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Configuración básica
app.use(cors());
app.use(express.json());

// Conexión a tu Supabase usando las variables de entorno de Vercel
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 1. Ruta de prueba para verificar que la API funciona
app.get('/api/test', (req, res) => {
  res.json({ 
    mensaje: "¡Hola! Tu API de Node.js/Express está completamente funcional en Vercel.",
    estado: "Exitosa"
  });
});

// 2. Ruta para guardar datos (ejemplo: simular el conteo de turistas)
app.post('/api/conteo', async (req, res) => {
  try {
    const { cantidad_turistas, ubicacion } = req.body;
    
    // Aquí mandamos los datos a Supabase
    const { data, error } = await supabase
      .from('conteo_turistas') // Asegúrate de tener esta tabla o cámbiala por una que tengas
      .insert([{ cantidad: cantidad_turistas, lugar: ubicacion, creado_en: new Date() }]);

    if (error) throw error;

    res.status(201).json({ mensaje: "Conteo registrado a través de la API", data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IMPORTANTE PARA VERCEL: Exportar la app
module.exports = app;