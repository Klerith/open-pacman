# SPEC 04 — Fix: ojos y fantasmas que salen del mapa y no regresan a la pen

> **Estado:** approved
> **Depende de:** SPEC 03 — Power pellets y modo asustado
> **Fecha:** 2026-06-30
> **Objetivo:** Corregir el comportamiento de los fantasmas tras ser comidos en modo asustado, sustituyendo la navegación de ojos por un teleport directo a su celda de inicio para que re-exiten como `chase`, eliminando los bugs de salirse del mapa y de no regresar a la pen. Además, corregir el comportamiento de los fantasmas que salen del mapa y no regresan a la pen.

## Alcance

**Dentro:**

- Sustituir la navegación greedy de los ojos (`PEN_EXIT → start` en `decideGhost` rama `eyes`) por un **teleport directo**: al comer un fantasma `frightened`, sus ojos se teleportan instantáneamente a su celda de inicio (`startX`, `startY`) dentro de la pen.
- Al teleportar, el fantasma vuelve al estado de re-exida: `mode = 'chase'`, `leftPen = false`, `released = true`, `releaseAt = performance.now()` (reutiliza la lógica del spec 02 para salir por `(13,11)`).
- Eliminar la rama `eyes` de `decideGhost` (ya no se navega) y el bloque en `moveGhost` que detecta la llegada a `startX/startY` (ya no hay viaje).
- Eliminar la excepción `mode !== 'eyes'` en `effLeftPen` (`decideGhost` y `moveGhost`): sin modo ojos, la puerta `3` vuelve a ser muro para todo fantasma con `leftPen=true`, como en el spec 02.
- `EYES_SPEED` y la rama `eyes` de `drawGhost` se conservan como código defensivo (sin uso real).

**Fuera de alcance (para futuros specs):**

- Animación visible de ojos regresando a la pen (el teleport es instantáneo).
- Cambios en `EYES_SPEED` o en el tie-break del greedy (no son la causa del bug).
- Nuevos comportamientos de fantasmas, niveles o frutas.
- Suite de tests automatizada.

## Modelo de datos

No se introducen nuevas estructuras ni constantes. Se reutilizan los campos ya definidos en SPEC 03:

```js
// src/js/game.js — cada ghost (campos existentes que se reutilizan)
const g = {
  x,
  y,
  dir,
  speed,
  kind,
  released,
  releaseAt,
  leftPen,
  mode, // 'chase' | 'frightened' | 'eyes'  — 'eyes' ya no se alcanza
  startX,
  startY, // destino del teleport
};
```

Convenencias:

- El teleport fija `g.x = g.startX`, `g.y = g.startY` directamente (sin navegación).
- El estado post-teleport es el de un fantasma recién liberado en `createGame`/`resetPositions`: `mode='chase'`, `leftPen=false`, `released=true`, `releaseAt=performance.now()`, `dir='up'`.
- `mode === 'eyes'` deja de aparecer en el flujo vivo; se conserva en el tipo y en `drawGhost` solo como defensa.

## Plan de implementación

1. **`src/js/game.js` — teleport al comer fantasma asustado.** En `update`, bloque de colisión, sustituir `g.mode = 'eyes'` por el teleport: `g.x = g.startX; g.y = g.startY; g.dir = 'up'; g.mode = 'chase'; g.leftPen = false; g.released = true; g.releaseAt = performance.now();`. Mantener el score escalado y `frightChain++`. Prueba manual: comer un fantasma azul hace que reaparezca instantáneamente en su celda dentro de la pen y comience a salir por `(13,11)` como `chase`.

2. **`src/js/game.js` — eliminar navegación de ojos muerta.** Borrar la rama `eyes` de `decideGhost` (bloque `if ( g.mode === 'eyes' ) { … }`) y el bloque de llegada en `moveGhost` ( `if ( g.mode === 'eyes' && g.x === g.startX && g.y === g.startY ) { … }` ). Prueba: sin errores en consola; ningún fantasma entra en modo ojos.

3. **`src/js/game.js` — restaurar bloqueo de puerta del spec 02.** Simplificar `effLeftPen` en `decideGhost` y en `moveGhost` a `g.leftPen` (sin `&& g.mode !== 'eyes'`). Prueba: ningún fantasma con `leftPen=true` reentra por la puerta `(13,12)`/`(14,12)`.

4. **`src/js/game.js` — corregir comportamiento de fantasmas que salen del mapa.** En `moveGhost`, si `g.x < 0 || g.x > 27 || g.y < 0 || g.y > 31` → `g.x = g.startX; g.y = g.startY; g.dir = 'up'; g.mode = 'chase'; g.leftPen = false; g.released = true; g.releaseAt = performance.now();`. Prueba: ningún fantasma sale del mapa y todos regresan a la pen.

5. **Verificación manual final.** Comer un power pellet y comer los 4 fantasmas uno a uno; cada uno reaparece en su `start` y re-exita por `(13,11)`. Confirmar que ningún fantasma sale del mapa y que todos regresan a la pen.

## Criterios de aceptación

- [ ] Al comer un fantasma asustado, sus ojos se teleportan instantáneamente a `(startX, startY)` — no hay navegación visible de ojos por el laberinto.
- [ ] Tras el teleport, el fantasma queda con `mode='chase'`, `leftPen=false`, `released=true`, `releaseAt=performance.now()` y re-exita por `(13,11)` con la lógica del spec 02.
- [ ] Ningún fantasma sale del laberinto (atraviesa paredes o bordes) tras comer un power pellet.
- [ ] Ningún fantasma queda "rebotando los ojos" sin regresar a la pen.
- [ ] El score al comer fantasmas sigue siendo `200/400/800/1600` según la cadena, reiniciada a `200` con cada power pellet.
- [ ] Tocar un fantasma recién teletransportado (aún dentro de la pen) no cuesta vida: está tras la puerta `3`, que Pac-Man no puede cruzar.
- [ ] La puerta `(13,12)`/`(14,12)` vuelve a ser muro para todo fantasma con `leftPen=true` (sin excepción `eyes`).
- [ ] Tras perder una vida, `resetPositions` sigue limpiando `frightUntil`/`frightChain` y dejando los fantasmas en `chase`.
- [ ] No hay errores en la consola al cargar `src/index.html`.
- [ ] El juego sigue siendo jugable: se gana al comer todos los dots y power pellets; se pierde al agotar vidas chocando con fantasmas `chase`.

## Decisiones

- **Sí:** teleport instantáneo al `start` al comer un fantasma asustado. Elimina de raíz la navegación de ojos, causa común de ambos bugs (salirse del mapa y no regresar a la pen).
- **Sí:** re-exitar inmediatamente con `releaseAt = performance.now()` en vez de re-escalar 1.5 s. Solo un fantasma reentra por vez; el stagger de 1.5 s del spec 02 era para los 4 al arranque de la partida.
- **Sí:** eliminar la rama `eyes` de `decideGhost` y el bloque de llegada en `moveGhost`. Son código muerto tras el teleport.
- **Sí:** eliminar la excepción `mode !== 'eyes'` en `effLeftPen`. Sin modo ojos, la puerta `3` vuelve al bloqueo canónico del spec 02.
- **Sí:** conservar `EYES_SPEED` (constante) y la rama `eyes` de `drawGhost` como código defensivo. Minimiza el diff y evita regresión visual si `mode` se asignara por error a `eyes`.
- **No:** tocar `EYES_SPEED` o el tie-break del greedy. El usuario confirmó que no son la causa del bug.
- **No:** animación visible de ojos regresando. El teleport es instantáneo por decisión del usuario.
- **No:** cambiar el score o la cadena de comidas. Funciona correctamente; fuera de scope.

## Riesgos

| Riesgo                                                                          | Mitigación                                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fantasma teletransportado a su `start` mientras Pac-Man está sobre la pen       | El `start` está dentro de la pen, tras la puerta `3`; Pac-Man no puede cruzar la puerta, así que no hay contacto. |
| Re-exitar inmediatamente sin stagger puede sentirse agresivo                    | Solo un fantasma reentra por vez; el stagger de 1.5 s era para los 4 al arranque. Aceptable.                      |
| Código defensivo (`EYES_SPEED`, rama `eyes` de `drawGhost`) confunde a lectores | Queda registrado en Decisiones por qué se conserva.                                                               |

## Lo que **no** está en este spec

- Animación visible de ojos navegando a la pen (teleport instantáneo).
- Cambios en `EYES_SPEED` o en el tie-break del greedy.
- Nuevos comportamientos de fantasmas, niveles, frutas o sonidos.
- Suite de tests automatizada.

Cada uno de esos, si aterriza, va en su propio spec.
