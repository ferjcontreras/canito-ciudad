# Canito en la Ciudad

Juego 3D (Three.js + TypeScript + Vite) ambientado en el microcentro de
Mendoza, Argentina. Manejás a **Canito** (un perrito) paseando por una ciudad
viva: peatones que caminan por las veredas y cruzan en las esquinas, autos y
motos circulando, y vida en las plazas (gente, niños jugando, perritos).

Es un derivado del juego *Canito y los Zombies*, reusando todo el escenario de
Mendoza pero con un enfoque de **ciudad viva** en vez de combate.

## Correr

```bash
npm install
npm run dev
```

- `index.html` → **Canito en la Ciudad** (modo principal).
- `zombies.html` → modo zombies original (referencia / reuso de escenario).

## Controles

- `↑ ↓ ← →` o `WASD` — mover
- `Shift` — correr

## Estructura

- `src/cityLife.ts` — entry de la ciudad viva.
- `src/city/` — sistemas de NPCs:
  - `CityGraph.ts` — grafo de navegación (calles + esquinas) y `PathAgent`.
  - `Pedestrians.ts` — peatones por las veredas, cruzando en esquinas.
  - `Traffic.ts` — autos y motos circulando.
  - `PlazaLife.ts` — gente, niños y perritos en las plazas.
  - `People.ts` — modelos low-poly (persona, niño, perro).
- `src/world/` — builders del escenario (calles, veredas, edificios, plazas…).
- `src/geo/` — layout de Mendoza y proyección geográfica.
