# SPEC 03 — Power pellets y modo asustado

> **Estado:** implementado
> **Depende de:** SPEC 01 — Comportamientos de los cuatro fantasmas; SPEC 02 — Salida de fantasmas desde la pen
> **Fecha:** 2026-06-30
> **Objetivo:** Añadir 4 power pellets que asustan a los fantasmas por 6s, dejándolos vulnerables a ser comidos por Pac-Man con puntaje escalado y obligando a sus ojos a regresar a la pen antes de re-exitar.

## Alcance

**Dentro:**

- Codificar 4 power pellets en `src/js/maze.js` como un nuevo valor de celda `4` (char `o` en `MAZE_STR`) en las celdas `(1,5)`, `(26,5)`, `(1,29)`, `(26,29)` (simétricas, todas `.` hoy).
- Comer un power pellet: `+50` puntos, decrementa `dotsRemaining`, y activa el modo asustado global durante `6000ms` con parpadeo los últimos `2000ms`.
- Modo asustado: los fantasmas en `chase` pasan a `frightened` (los `eyes` no se afectan). Reversión inmediata de dirección solo para los que ya estén fuera de la pen (`leftPen=true`).
- Movimiento asustado: dirección aleatoria válida en cada cruce (sin perseguir) y speed reducida `0.05`.
- Comer fantasmas: contacto con un `frightened` → fantasma comido (Pac-Man no pierde vida), score escalado `200/400/800/1600` según cadena, reiniciada a `200` con cada power pellet.
- Modo ojos: fantasma comido → `mode='eyes'`, se dibuja solo como dos ojos, regresa greedy a `PEN_EXIT (13,11)`, cruza la puerta (excepción al bloqueo del spec 02), baja a su celda de start y al llegar vuelve a `chase` y re-exita con la lógica del spec 02. Speed ojos `0.15`. Contacto con ojos: inofensivo.
- Re-disparo: comer un 2º power pellet con modo activo resetea el timer a `6000ms` y la cadena a `200`.
- Render en `src/js/render.js`: power pellets como círculos mayores; `frightened` azul `#0000ff` (distinto del muro `#2121ff`) con parpadeo a blanco `#ffffff`; `eyes` solo ojos.
- Reinicio en `resetPositions` (`src/js/game.js`): limpia `frightUntil`/`frightChain` y deja todos los fantasmas en `chase`.

**Fuera de alcance (para futuros specs):**

- Variación de duración o velocidad por nivel (no hay niveles todavía).
- Frutas bonus.
- Sonidos.
- Pathfinding A\* o caminos guionizados complejos para los ojos (basta el greedy).
- Multijugador o modos de juego alternativos.

## Modelo de datos

Se amplía el encoding de celdas, el estado global y cada ghost. No se introducen nuevos archivos.

```js
// src/js/maze.js — parseTile gana una rama
function parseTile(ch) {
  if (ch === '#') return 1;
  if (ch === '.') return 2;
  if (ch === 'o') return 4; // power pellet
  if (ch === '-') return 3;
  return 0;
}

// MAZE_STR: filas 5 y 29 cambian sus celdas (1,*) y (26,*) de '.' a 'o'
//   fila 5:  '#o........................o#'
//   fila 29: '#o........................o#'
//   (24 puntos entre ambos 'o')
```

```js
// src/js/game.js — constantes nuevas
const FRIGHT_DURATION_MS = 6000;
const FRIGHT_FLASH_MS = 2000;
const FRIGHTENED_SPEED = 0.05; // mitad de GHOST_SPEED (0.1)
const EYES_SPEED = 0.15; // 1.5x GHOST_SPEED
const POWER_PELLET_SCORE = 50;
const GHOST_EAT_SCORES = [200, 400, 800, 1600];
```

```js
// src/js/game.js — estado de partida (createGame) gana dos campos
const game = {
  // ...campos existentes...
  frightUntil: 0, // performance.now() en el que termina el modo asustado; 0 = inactivo
  frightChain: 0, // nº de fantasmas comidos en la fase actual (0..3 para score)
};

// src/js/game.js — cada ghost gana mode + start
const g = {
  // ...campos existentes (x, y, dir, kind, released, releaseAt, leftPen)...
  mode: 'chase', // 'chase' | 'frightened' | 'eyes'
  startX, // = GHOST_STARTS[i].x (fijo, para el regreso de ojos)
  startY, // = GHOST_STARTS[i].y
};
```

Convenciones:

- El modo asustado es **global** (un `frightUntil`); el `mode` es **por fantasma**, para que unos puedan estar en `eyes` mientras otros siguen `frightened`.
- La velocidad efectiva de un ghost se deriva de `mode`: `chase`→`GHOST_SPEED`, `frightened`→`FRIGHTENED_SPEED`, `eyes`→`EYES_SPEED`.
- La puerta `3` es transitable para un ghost iff `mode === 'eyes'` (excepción al bloqueo de reentrada del spec 02). En `canMove`/`decideGhost`, para un ghost se pasa `leftPen` efectivo como `g.leftPen && g.mode !== 'eyes'`.

## Plan de implementación

1. **`src/js/maze.js` + `src/js/render.js` — power pellets visibles y comestibles como dot.** En `parseTile` añadir `if (ch==='o') return 4;`. En `MAZE_STR` cambiar a `o` las celdas `(1,5)`,`(26,5)` (fila 5) y `(1,29)`,`(26,29)` (fila 29). En `createGame`, `dotsRemaining` cuenta `v===2 || v===4`. En `movePacman`, al pisar `4`: `grid=0`, `score+=POWER_PELLET_SCORE`, `dotsRemaining--` (sin disparar fright aún). En `drawDots` dibujar `4` como círculo de radio ~6. Prueba manual: abrir `src/index.html`, sin errores; se ven 4 dots grandes; al comerlos suman 50 y desaparecen; el juego sigue ganable.

2. **`src/js/game.js` — modo asustado: estado, trigger y velocidad.** Añadir las constantes nuevas. En `createGame`: `frightUntil:0`, `frightChain:0`, y por ghost `mode:'chase'`, `startX`/`startY`. En `movePacman`, al comer `4` además disparar: `frightUntil=performance.now()+FRIGHT_DURATION_MS`, `frightChain=0`, y por cada ghost con `mode==='chase'` → `mode='frightened'` (reversar `g.dir=OPPOSITE[g.dir]` solo si `g.leftPen`). En `update`, al inicio: si `frightUntil>0 && performance.now()>=frightUntil` → expira: todos los `frightened`→`chase`, `frightUntil=0`, `frightChain=0`. En `moveGhost`, speed efectiva según `mode`. En `decideGhost`, rama `frightened`: `g.dir = choices[ Math.floor( Math.random() * choices.length ) ]`. Prueba: al comer un power pellet los fantasmas se ralentizan y giran aleatorio (aún sin color).

3. **`src/js/render.js` — visuales de asustado y ojos.** `drawGhost` recibe `mode` y `frightUntil`: si `frightened` → cuerpo `#0000ff`, y si `frightUntil - now < FRIGHT_FLASH_MS` alterna con `#ffffff` según `frame`; si `eyes` → dibuja solo los dos ojos (sin cuerpo). `drawDots` ya dibuja `4` grande (del step 1). `draw` pasa `mode` y `frightUntil` a cada `drawGhost`. Prueba: fantasmas azules al asustarse, parpadeo al final, ojos solos tras ser comidos.

4. **`src/js/game.js` — comer fantasmas.** En `update`, reescribir el bloque de colisión: si `g.mode==='frightened'` y `collides` → `g.mode='eyes'`, `score += GHOST_EAT_SCORES[ Math.min(game.frightChain,3) ]`, `game.frightChain++`. Si `g.mode==='eyes'` → ignorar. Si `g.mode==='chase'` → perder vida (lógica existente). Prueba: tocar un fantasma azul lo convierte en ojos y sube el score 200→400→800→1600; tocar ojos no quita vida.

5. **`src/js/game.js` — navegación de ojos de regreso.** En `decideGhost`, rama `eyes`: si `Math.round(g.x)===PEN_EXIT.x && Math.round(g.y)===PEN_EXIT.y` → objetivo `(g.startX,g.startY)`; si no → objetivo `PEN_EXIT`. Greedy Manhattan hacia el objetivo (como `hunter`). En las llamadas a `canMove` para ghosts, pasar `leftPen` efectivo `g.leftPen && g.mode!=='eyes'` (puerta transitable para ojos). Cuando `Math.round(g.x)===g.startX && Math.round(g.y)===g.startY` → `g.mode='chase'`, `g.leftPen=false`, `g.released=true`, `g.releaseAt=performance.now()` (re-exita con spec 02). Prueba: un fantasma comido baja como ojos hasta su start, reentra y vuelve a salir persiguiendo.

6. **`src/js/game.js` — reinicio tras muerte.** En `resetPositions`: `game.frightUntil=0`, `game.frightChain=0`, y por cada ghost `g.mode='chase'` (los ojos vuelven a ser `chase` en su start). Prueba: tras perder una vida no queda modo asustado residual y los 4 fantasmas vuelven a salir escalonados cada 1.5s.

## Criterios de aceptación

- [ ] El laberinto tiene exactamente 4 power pellets en `(1,5)`,`(26,5)`,`(1,29)`,`(26,29)`, codificados como valor `4` (char `o`).
- [ ] Los power pellets se dibujan como círculos claramente mayores que los dots normales.
- [ ] Comer un power pellet suma `50` puntos y reduce `dotsRemaining` en 1.
- [ ] Comer un power pellet pone en modo asustado a todos los fantasmas en `chase` durante `6000ms` (los `eyes` no se ven afectados).
- [ ] Al dispararse el modo asustado, los fantasmas con `leftPen=true` reversan su dirección inmediatamente.
- [ ] Los fantasmas asustados se mueven a speed `0.05` y eligen dirección aleatoria válida en cada cruce.
- [ ] Los fantasmas asustados se dibujan azules `#0000ff` y parpadean a blanco `#ffffff` en los últimos `2000ms`.
- [ ] Pac-Man al tocar un fantasma asustado lo come (no pierde vida): score `200/400/800/1600` según la cadena, reiniciada a `200` con cada power pellet.
- [ ] Un fantasma comido pasa a modo ojos (solo ojos visibles) y regresa greedy a `PEN_EXIT (13,11)`, cruza la puerta (excepción del spec 02) y baja a su celda de start.
- [ ] Al llegar a su start, el fantasma vuelve a `chase` y re-exita la pen con la lógica del spec 02.
- [ ] Tocar un fantasma en modo ojos es inofensivo (no pierde vidas).
- [ ] Comer un segundo power pellet con modo activo resetea el timer a `6000ms` y la cadena a `200`.
- [ ] Tras perder una vida, `resetPositions` limpia `frightUntil`/`frightChain` y deja todos los fantasmas en `chase`.
- [ ] El juego sigue siendo jugable: se gana al comer todos los dots y power pellets; se pierde al agotar vidas chocando con fantasmas `chase`.
- [ ] No hay errores en la consola al cargar `src/index.html`.

## Decisiones

- **Sí:** 4 power pellets en `(1,5)`,`(26,5)`,`(1,29)`,`(26,29)`. Simétricos, fieles al clásico, sobre celdas `.` existentes.
- **Sí:** codificar power pellet como valor `4` (char `o`). Consistente con el encoding `1/2/3/0` y con que `render.js` ya itera el grid.
- **Sí:** modo asustado global (`frightUntil`) + `mode` por fantasma (`chase`/`frightened`/`eyes`). Permite que unos estén comidos (eyes) mientras otros siguen asustados.
- **Sí:** duración `6000ms` fijos + parpadeo `2000ms` finales. Sin niveles, no escala.
- **Sí:** movimiento asustado aleatorio + speed `0.05`. Clásico y simple; huir-directamente sería más código y menos fiel.
- **Sí:** reversión inmediata al disparar, solo para `leftPen=true`. No reversar los de dentro para no romper el guion de salida del spec 02.
- **Sí:** puntaje escalado `200/400/800/1600` con cadena reiniciable por power pellet. Canon clásico.
- **Sí:** power pellet vale `50` puntos. Canon clásico.
- **Sí:** eyes regresan greedy a `PEN_EXIT (13,11)` y luego bajan a su start; al llegar re-exitan con spec 02. Reutiliza el greedy existente.
- **Sí:** excepción al bloqueo de reentrada del spec 02 para `mode==='eyes'` (puerta `3` transitable solo para ojos). Sin esto los ojos no pueden reentrar.
- **Sí:** ojos inofensivos y speed `0.15`. Canon clásico.
- **Sí:** re-disparo resetea timer y cadena. Canon clásico.
- **No:** huir directamente de Pac-Man en modo asustado. Más complejo y menos fiel.
- **No:** camino guionizado para los ojos. El greedy basta con el esquema en dos fases.
- **No:** variación de duración/velocidad por nivel. No hay niveles todavía.
- **No:** sonidos ni frutas bonus.

## Riesgos

| Riesgo                                                                     | Mitigación                                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Greedy de ojos con mínimo local cerca de la pen                            | Esquema en dos fases (objetivo `PEN_EXIT` primero, luego `start`); la bajada por la columna 13 es lineal. |
| Parpadeo dependiente de `frame` se ve distinto a distinta tasa de refresco | Ya se usa `frame` para la boca de Pac-Man; aceptable y coherente con el proyecto.                         |
| Reversar `dir` con el ghost a mitad de celda                               | Seguro: el ghost vuelve sobre la celda de la que venía (transitable); no puede apuntar a un muro.         |

## Lo que **no** está en este spec

- Variación de duración o velocidad por nivel (no hay niveles todavía).
- Frutas bonus.
- Sonidos.
- Pathfinding A\* o caminos guionizados complejos para los ojos.
- Multijugador o modos de juego alternativos.

Cada uno de esos, si aterriza, va en su propio spec.
