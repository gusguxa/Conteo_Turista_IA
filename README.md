Contador Turístico IA
Descripción del Proyecto
Este proyecto es una solución diseñada para el municipio de Calvillo, Aguascalientes. 
Es una aplicación móvil multiplataforma desarrollada con Ionic 8 y Angular, que utiliza Inteligencia Artificial (TensorFlow.js) para el conteo y monitoreo de afluencia en puntos turísticos en tiempo real.
La app permite a los administradores visualizar y analizar tendencias históricas y supervisar transmisiones en vivo.

Requisitos Técnicos (Lista de Cotejo)
Arquitectura: Angular Moderno con Componentes Standalone y gestión de estado.
UI/UX: Componentes nativos de Ionic 8, diseño responsivo y animaciones de.
IA Adaptativa: Implementación de modelo para detección de personas con calibración de umbral dinámica.
Nativo: Integración de Capacitor Plugins (Haptics para feedback táctil y manejo de hardware).
ersistencia: Sincronización en tiempo real con Firebase Cloud Firestore.

Framework: Ionic 8 + Angular 18 (Standalone).
Backend: Firebase (Auth & Firestore).
IA: TensorFlow.js + COCO-SSD.
Gráficos: ApexCharts.
Mapas: Leaflet.js.
Streaming: WebRTC para señalización en vivo.

Instalación y Configuración
1. Clonar el repositorio
Bash
git clone https://github.com/tu-usuario/contador-turistico-ia.git
cd contador-turistico-ia ( en caso de que este fuera de la carpeta)
2. Instalar dependencias
Bash
npm install
3. Configuración de Firebase
Asegúrate de tener configurado el archivo src/environments/environment.ts con las credenciales de Firebase.
4. Ejecución en modo desarrollo
Bash
ionic serve
5. Sincronización con plataformas nativas (Android/iOS)
Bash
npx cap sync
npx cap open android (para abrir la app con Android studio)

Desarrolladores
Leilani Serna Gómez
(Aquí agregren su nombre porfi) 
Institución
 Universidad Tecnológica de Calvillo
Carrera
Ingeniería en Tecnologías de la Información

