# SPEC 02 — Salida de fantasmas desde la pen

> **Estado:** Approved
> **Depende de:** SPEC 01 — Comportamientos de los cuatro fantasmas
> **Fecha:** 2026-06-30
> **Objetivo:** Hacer que cada fantasma abandone la pen al ser liberado siguiendo un camino guionizado hasta la celda de salida `(13,11)`, y transicione a su comportamiento de persecución normal sin quedar atrapado dentro.

## Por qué existe este spec

El spec 01 dejó fuera los "circuitos de salida no triviales desde la pen". En la práctica, `decideGhost` elige dirección por distancia Manhattan al objetivo, y dentro de la pen las distancias empatan: con `DIRS` ordenado `left` primero, los fantasmas giran en bucle `(13,14)→(12,14)→(12,15)→(13,15)→(13,14)→…` y nunca toman la puerta `(13,12)`/`(14,12)`. La liberación temporizada (`released`/`releaseAt`) funciona; el fallo es puramente la lógica de navegación de salida.

## Alcance

**Dentro:**

- Añadir un camino guionizado de salida desde cada start de la pen hasta la celda de salida `(13,11)`, activo mientras `g.released && !g.leftPen`.
- Añadir el flag `leftPen` por fantasma, puesto a `true` al alcanzar `(13,11)`. Mientras sea `false`, el fantasma sigue el camino guionizado; al volverse `true`, cede el control a `decideGhost` (comportamiento del spec 01).
- Bloquear la reentrada a la pen: tratar la puerta `3` como muro para todo fantasma con `leftPen=true`.
- Reiniciar `released`, `leftPen` y `releaseAt` en `resetPositions` (tras muerte de Pac-Man), re-escalonando la salida cada 1.5s desde `performance.now()`.

**Fuera de alcance (para futuros specs):**

- Modo asustado (Frightened) y el regreso a la pen tras ser comido (eyes mode). Va con los power-pellets.
- Variación del orden o cadencia de liberación por nivel.
- Salidas alternativas o rutas no deterministas.
- Cambios en `render.js`.

## Modelo de datos

No se introducen nuevas estructuras globales. Se amplían los ghosts existentes con un flag y se añade una constante:

```js
// src/js/game.js — constante nueva
const PEN_EXIT = { x: 13, y: 11 };

// src/js/game.js — cada ghost gana un campo
const g = {
  x,
  y,
  dir,
  speed,
  kind,
  released: false,
  releaseAt: 0,
  leftPen: false, // false = dentro de la pen siguiendo el camino de salida
  // true  = fuera, decideGhost controla
};
```

Convenciones:

- El camino de salida es determinista: primero alinea `x` a `PEN_EXIT.x` (13), luego sube hasta `PEN_EXIT.y` (11).
- `leftPen` solo pasa de `false`→`true` una vez por vida; se resetea a `false` solo en `createGame` y `resetPositions`.

## Plan de implementación

1. En `src/js/game.js` añadir la constante `PEN_EXIT = { x: 13, y: 11 }` e inicializar `leftPen: false` en cada ghost dentro de `createGame`. Prueba manual: abrir `src/index.html`, sin errores en consola; los fantasmas siguen esperando en la pen sin moverse (el flag aún no se usa).

2. Añadir `exitPenStep(game, g)` en `src/js/game.js`: si `Math.round(g.x) !== PEN_EXIT.x`, pone `g.dir` a `'left'` o `'right'` según corresponda; si ya está en la columna, pone `g.dir = 'up'`. En `moveGhost`, sustituir la llamada a `decideGhost` por: si `g.released && !g.leftPen` → si está en `(PEN_EXIT.x, PEN_EXIT.y)` poner `g.leftPen = true` y llamar `decideGhost`, si no llamar `exitPenStep`; en caso contrario llamar a `decideGhost` como antes. Prueba: cada fantasma liberado sube por la pen y sale por `(13,11)` en lugar de quedar en bucle.

3. Bloquear reentrada: extender `isWall` y `canMove` con un parámetro `leftPen` (o equivalente) de modo que `v === 3` cuente como muro cuando `actor === 'ghost' && leftPen`. Pasar `g.leftPen` desde `decideGhost` (y `exitPenStep` si llama a `canMove`). Prueba: una vez fuera, ningún fantasma vuelve a entrar por la puerta `(13,12)`/`(14,12)`.

4. En `resetPositions` (`src/js/game.js`), además de teleportar a los starts, reiniciar cada ghost con `released = false`, `leftPen = false` y `releaseAt = performance.now() + (i + 1) * GHOST_RELEASE_INTERVAL_MS`. Prueba: tras perder una vida, los 4 fantasmas vuelven a la pen y salen escalonados cada 1.5s en el orden `hunter`→`ambusher`→`patrol`→`random`.

## Criterios de aceptación

- [ ] Al iniciar la partida, los 4 fantasmas permanecen quietos en la pen hasta su `releaseAt`.
- [ ] Al liberarse, cada fantasma recorre el camino `align x→13`, `sube a (13,11)` sin girar en bucle dentro de la pen.
- [ ] Al alcanzar `(13,11)`, el fantasma cambia a su comportamiento del spec 01 (`hunter`/`ambusher`/`patrol`/`random`).
- [ ] Ningún fantasma con `leftPen=true` vuelve a cruzar la puerta `(13,12)` o `(14,12)`.
- [ ] Tras una muerte de Pac-Man, `resetPositions` reinicia `released`, `leftPen` y `releaseAt`, y los fantasmas vuelven a salir escalonados cada 1.5s en el orden `hunter`→`ambusher`→`patrol`→`random`.
- [ ] No hay errores en la consola al cargar `src/index.html`.
- [ ] El juego sigue siendo jugable: Pac-Man pierde vidas al chocar con cualquier fantasma ya fuera y gana al comer todos los dots.

## Decisiones

- **Sí:** camino guionizado (alinea x a 13, sube a `(13,11)`). Determinista, fiel al Pac-Man clásico, no mezcla lógica de salida con lógica de persecución.
- **Sí:** celda de salida única `(13,11)`. Todos confluyen ahí y luego `decideGhost` los dispersa; minimiza estado.
- **Sí:** flag `leftPen` por fantasma para distinguir "dentro siguiendo el guion" de "fuera persiguiendo". Reutiliza `released` del spec 01 sin cambiar su significado.
- **Sí:** bloquear reentrada tratando la puerta `3` como muro para fantasmas con `leftPen=true`. Sin modo asustado no hay razón para volver a entrar; evita re-trampas.
- **Sí:** reinicio completo (`released`/`leftPen`/`releaseAt`) en `resetPositions` con re-escalado 1.5s. Coherente con el arranque de partida y con el comportamiento clásico.
- **No:** meta temporal dentro de `decideGhost` (mezcla lógica de salida con persecución y hereda el bug de empates).
- **No:** forzar solo la columna 13 y dejar que el greedy suba. No garantiza salir (empates de distancia).
- **No:** ojos/eyes mode y regreso a la pen tras ser comido. Va con el spec de power-pellets.

## Lo que **no** está en este spec

- Modo asustado (Frightened), power-pellets y comida de fantasmas vulnerables — otro spec.
- Eyes mode (regreso a la pen tras ser comido).
- Variación de orden o cadencia de liberación por nivel.
- Rutas de salida alternativas o no deterministas.
- Cambios en `render.js`.
