# Scuinklezam

> **El juego definitivo para adivinar canciones con amigos impulsado por Spotify.**

**Scuinklezam** convierte el catálogo mundial de Spotify en una arena competitiva multijugador en tiempo real. Crea salas privadas gratis, comparte tu código con amigos, mezcla vuestros gustos musicales con el **Taste Blender** y compite para demostrar quién sabe más de música.

---

## Características Principales

- **7 Modos Ranked Únicos**:
  - **Mezcla de Gustos (Taste Blender)**: Combina los artistas favoritos y canciones de todos los participantes.
  - **Top 50 Mundial**: Los mayores éxitos del catálogo global de Spotify.
  - **Votación Democrática**: Propuestas y votación de géneros en vivo dentro del lobby.
  - **Caos Random**: Mezcla impredecible de épocas y estilos.
  - **¿De quién es este temazo?**: Adivina la canción y a qué amigo de la sala le gusta (+50 pts bonus).
  - **Supervivencia**: 3 vidas, fallar una respuesta te acerca a la eliminación.
  - **Fiesta TV / Sofá**: Interfaz visual optimizada para Smart TV y pantallas gigantes.
- **Audio Oficial y Carátulas Verificadas**: Previews musicales garantizados en todas las rondas con sincronización y guardado directo de canciones en Spotify (`Guardar en Favoritos`).
- **Autocompletado de Artistas en Tiempo Real**: Buscador reactivo integrado con la API oficial de Spotify.
- **Sincronización Multijugador en la Nube con Upstash Redis**: Persistencia de salas en la nube escalable para producción en Vercel.
- **Zero Emojis**: Diseño visual elegante con iconografía vectorial SVG de Lucide React y paleta **Verde Duende**.

---

## Requisitos y Configuración

Copia `.env.example` a `.env.local` y configura tus credenciales:

```env
SPOTIFY_CLIENT_ID=tu_spotify_client_id
SPOTIFY_CLIENT_SECRET=tu_spotify_client_secret
UPSTASH_REDIS_REST_URL=https://tu-base-datos.upstash.io
UPSTASH_REDIS_REST_TOKEN=tu_token_upstash
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

---

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build
npm start
```

---

## Lanzador de Acceso Rápido en Windows

Haz doble clic en `Jugar-Scuinklezam-Local.bat` en tu Escritorio para arrancar el servidor en local y generar automáticamente un túnel seguro de Cloudflare listo para compartir con tus amigos en Discord.
