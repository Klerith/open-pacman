# SPEC 01 — Comportamientos de los cuatro fantasmas

> **Estado:** Approved
> **Depende de:** (ninguno — spec inicial)
> **Fecha:** 2026-06-30
> **Objetivo:** Definir cuatro fantasmas con comportamientos distintos (persecución agresiva, emboscada, patrulla y aleatorio) liberados escalonadamente cada 1.5 s desde la pen.

## Alcance

**Dentro:**

- Ampliar `GHOST_STARTS` (`src/js/maze.js`) de 2 a 4 fantasmas dentro de la pen: `(13,14) hunter`, `(14,14) random`, `(12,14) ambusher`, `(15,14) patrol`.
- Implementar 4 comportamientos en `decideGhost` (`src/js/game.js`):
  - `hunter`: persigue directamente la celda actual de Pac-Man (ya existe).
  - `ambusher`: apunta a 4 celdas por delante de Pac-Man en su dirección actual.
  - `patrol`: alterna entre la esquina superior-izquierda `(1,1)` y la inferior-derecha `(26,29)` como objetivo de persecución directa; cambia de objetivo al llegar a uno.
  - `random`: gira aleatoriamente en cruces (ya existe).
- Liberación escalonada desde la pen cada 1.5 s medidos con `performance.now()`. Los fantasmas salen en el orden `hunter`, `ambusher`, `patrol`, `random`.
- Colores por `kind` en `render.js`: `hunter`=rojo, `ambusher`=rosa, `patrol`=cian, `random`=naranja.

**Fuera de alcance (para futuros specs):**

- Power-pellets y modo asustado (Frightened). Va en su propio spec.
- Comida de fantasmas al estar vulnerables.
- Circuitos de salida no triviales desde la pen (cada fantasma sale en línea recta hacia la puerta).
- Niveles adicionales o cambios de velocidad por nivel.
- Sonidos.

## Modelo de datos

No se introducen nuevas estructuras de datos globales. Se reutilizan las existentes y se amplían:

```js
// src/js/maze.js — GHOST_STARTS pasa de 2 a 4 entradas
const GHOST_STARTS = [
  { x: 13, y: 14, kind: 'hunter' }, // sale 1º
  { x: 12, y: 14, kind: 'ambusher' }, // sale 2º
  { x: 15, y: 14, kind: 'patrol' }, // sale 3º
  { x: 14, y: 14, kind: 'random' }, // sale 4º
];

// src/js/game.js — cada ghost gana dos campos
const g = {
  x,
  y,
  dir,
  speed,
  kind,
  released: false, // aún dentro de la pen
  releaseAt: 0, // ms (performance.now()) en que debe liberarse
};
```

```js
// src/js/game.js — constantes nuevas
const GHOST_RELEASE_INTERVAL_MS = 1500;
const AMBUSHER_AIM_STRIDE = 4; // celdas por delante de Pac-Man
const PATROL_CORNERS = [
  { x: 1, y: 1 },
  { x: 26, y: 29 },
];
```

Convenciones:

- Coordenadas: origen arriba-izquierda, `x ∈ [0,27]`, `y ∈ [0,30]`.
- El temporizador de liberación se cuenta en **ms reales** (`performance.now()`), no en frames.

## Plan de implementación

1. Ampliar `GHOST_STARTS` en `src/js/maze.js` a 4 entradas con los `kind` y el orden de liberación indicados. Prueba manual: abrir `src/index.html`, no debe haber errores de consola; aún solo se mueven 2 fantasmas visibles.

2. En `createGame` (`src/js/game.js`), inicializar cada ghost con `released:false` y `releaseAt: index * GHOST_RELEASE_INTERVAL_MS` medido desde `performance.now()` al iniciar. Prueba: al arrancar la partida, los 4 existen pero los nuevos permanecen quietos en la pen.

3. En `update` (`src/js/game.js`), antes de mover cada ghost, comprobar si `performance.now()` supera `releaseAt` y, si es así, marcar `released=true`. Los ghosts con `released:false` no se mueven ni deciden. Prueba: cada 1.5 s sale un fantasma nuevo de la pen, en el orden `hunter`, `ambusher`, `patrol`, `random`.

4. Implementar la rama `ambusher` en `decideGhost`: objetivo = celda de Pac-Man + `AMBUSHER_AIM_STRIDE * DIRS[pacman.dir]`. Se elige la dirección que minimice la distancia Manhattan a ese objetivo. Prueba: el fantasma rosa tiende a cortarte el paso por delante.

5. Implementar la rama `patrol` en `decideGhost`: per-segue directamente la esquina activa de `PATROL_CORNERS`; al llegar (distancia Manhattan ≤ 1) se alterna a la otra. Prueba: el fantasma cian viaja entre las dos esquinas opuestas.

6. Asignar colores por `kind` en `render.js`: `hunter`=`#ff0000`, `ambusher`=`#ffb8ff`, `patrol`=`#00ffff`, `random`=`#ffb851`. Prueba: los 4 fantasmas se distinguen por color.

## Criterios de aceptación

- [ ] `GHOST_STARTS` tiene exactamente 4 entradas con `kind` `hunter`, `ambusher`, `patrol`, `random` en ese orden de liberación.
- [ ] Al iniciar la partida, los 4 fantasmas están dentro de la pen y los 3 aún no liberados permanecen quietos.
- [ ] Cada 1.5 s (±50 ms) se libera exactamente un fantasma, en el orden `hunter` → `ambusher` → `patrol` → `random`.
- [ ] El fantasma `hunter` (rojo) persigue directamente la celda actual de Pac-Man.
- [ ] El fantasma `ambusher` (rosa) apunta a 4 celdas por delante de Pac-Man en su dirección actual.
- [ ] El fantasma `patrol` (cian) alterna entre las esquinas `(1,1)` y `(26,29)` como objetivo de persecución.
- [ ] El fantasma `random` (naranja) elige direcciones aleatorias en los cruces.
- [ ] No hay errores en la consola al cargar `src/index.html`.
- [ ] El juego sigue siendo jugable: Pac-Man pierde vidas al chocar con cualquier fantasma liberado y gana al comer todos los dots.

## Decisiones

- **Sí:** 4 personalidades del Pac-Man clásico simplificado (`hunter`, `ambusher`, `patrol`, `random`). Reflejan los arquetipos Blinky/Pinky/Clyde/Inky sin reproducirlos exactamente.
- **Sí:** liberación escalonada cada 1500 ms en el orden `hunter`, `ambusher`, `patrol`, `random`. Evita que los 4 aplasten al inicio.
- **Sí:** temporizador en ms reales (`performance.now()`). Independiente de la tasa de refresco del monitor.
- **Sí:** `ambusher` apunta 4 celdas por delante de Pac-Man (stride clásico de Pinky).
- **Sí:** `patrol` alterna entre `(1,1)` y `(26,29)`. Es la simplificación razonable de Clyde/Inky sin reproducir su lógica condicional.
- **Sí:** posiciones de inicio dentro de la pen en `(12,14)`, `(13,14)`, `(14,14)`, `(15,14)`.
- **Sí:** colores por `kind` (rojo, rosa, cian, naranja) para distinguirlos visualmente.
- **No:** power-pellets y modo Frightened. Queda para otro spec.
- **No:** circuitos de salida no triviales desde la pen. Cada fantasma sale en línea recta hacia la puerta.

## Lo que **no** está en este spec

- Power-pellets y modo asustado (Frightened) — otro spec.
- Comida de fantasmas vulnerables.
- Circuitos de salida elaborados desde la pen.
- Niveles adicionales o cambios de velocidad por nivel.
- Sonidos.
