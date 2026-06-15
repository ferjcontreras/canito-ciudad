# Canito en la Ciudad — *"Canito y el último mate"*

Juego 3D (Three.js + TypeScript + Vite) ambientado en el microcentro de
**Mendoza, Argentina**. Manejás a **Canito**, un perrito que se perdió y tiene
que volver con su dueño, en una ciudad viva: peatones por las veredas, autos y
motos circulando, el metrotranvía, y vida en las plazas (gente, niños, perritos).

## La historia

Don Ernesto, el dueño de Canito, lo dejó atado afuera del **Café de la Plaza** y
entró a tomar su cortado. Sopló el zonda, se soltó la correa… y cuando Canito
levantó la cabeza, ya no estaba. **Hay que encontrarlo antes de que caiga la
noche.**

Don Ernesto va **caminando por la ciudad** (no está quieto): le vas pisando los
talones preguntándole a la gente. Cada persona da una **pista** y te manda al
siguiente lugar, en una cadena por los puntos reales de Mendoza:

**Café de la Plaza → Plaza Independencia → Av. San Martín → Metrotranvía
(Belgrano) → Portones del Parque → el lago del Parque San Martín** 🐾

## Cómo se juega

- Seguí la **flecha-brújula** y el **rastro de olor** (huellitas) hasta la
  persona que **brilla (✨)**, acercate y apretá **E** para hablar.
- Las pistas son **en orden**: el dueño recién aparece al completar todas (si vas
  derecho al parque, todavía no llegó).
- **Dos barras:**
  - 🌇 **Atardecer** — un reloj que corre (~10 min). Si cae la noche, perdés.
  - 🐾 **Ánimo** — decae de a poco; si llega a 0, Canito se acobarda y perdés.
- **Sustos:** los autos, motos y el tranvía cerca y rápido te bajan el ánimo y te
  pegan un susto. (No te matan — Canito corre más lento que los autos, ojo.)
- **Recuperás ánimo:** juntando **huesitos** por la ruta, o dejando que la
  **gente te acaricie** (te ven, se frenan y te miran → salen corazones ❤️).
- Los **perritos de las plazas** se acercan a **olfatearte**.

## Audio

Todo el audio es diegético (sin música de fondo enlatada):

- **Motores** reales de auto, moto y **metrotranvía**, con volumen por distancia
  (caída cúbica) y paneo estéreo.
- **Bocinas** reales (las motos, un poco más agudas).
- **Pasos** de la gente que camina cerca.
- **Música:** un *chiptune* original generado en vivo (WebAudio) con aire de
  **folclore cuyano / Vendimia** (6/8, guitarra punteada). Libre de derechos.

El navegador exige un gesto para arrancar el sonido: tocá el botón
**🔊 Activar sonido**. Créditos de los samples en `public/audio/CREDITS.txt`.

## Controles

- `↑ ↓ ← →` o `WASD` — mover
- `Shift` — correr
- `E` — hablar con la persona que brilla
- `M` — música on/off
- `C` — calidad de render (Rendimiento → Equilibrada → Alta)
- `Espacio` — reiniciar (al ganar o perder)

## Correr

```bash
npm install
npm run dev
```

- `index.html` → **Canito en la Ciudad** (modo principal, la aventura).
- `zombies.html` → modo zombies original (referencia / reuso de escenario).

## Estructura

- `src/cityLife.ts` — entry del juego (mundo + misión + HUD + audio).
- `src/city/` — sistemas de la ciudad:
  - `Quest.ts` — la misión: NPCs, pistas en orden, brújula y rastro de olor.
  - `CityGraph.ts` — grafo de navegación (calles + esquinas) y `PathAgent`.
  - `Pedestrians.ts` — peatones por las veredas; `greet()` (los mimos a Canito).
  - `Traffic.ts` — autos y motos circulando.
  - `PlazaLife.ts` — gente, niños y perritos; `sniff()` (perros que lo huelen).
  - `Transit.ts` / `TrafficLights.ts` — metrotranvía con estaciones y semáforos.
  - `CityAudio.ts` — motores/bocinas/pasos/tranvía + música.
  - `ChipMusic.ts` — música chiptune original.
  - `People.ts` — modelos low-poly (persona, niño, perro).
- `src/world/` — builders del escenario (calles, veredas, edificios, plazas…).
- `src/geo/` — layout de Mendoza y proyección geográfica.
- `src/entities/` — Canito, tranvía, bus, huesitos, etc.
```
