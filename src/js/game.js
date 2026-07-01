// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

const GHOST_RELEASE_INTERVAL_MS = 1500;
const POWER_PELLET_SCORE = 50;
const FRIGHT_DURATION_MS = 6000;
const FRIGHT_FLASH_MS = 2000;
const FRIGHTENED_SPEED = 0.05; // mitad de GHOST_SPEED (0.1)
const EYES_SPEED = 0.15;       // 1.5x GHOST_SPEED
const GHOST_EAT_SCORES = [ 200, 400, 800, 1600 ];
const AMBUSHER_AIM_STRIDE = 4; // celdas por delante de Pac-Man
const PATROL_CORNERS = [
  { x: 1, y: 1 },
  { x: 26, y: 29 },
];
const PEN_EXIT = { x: 13, y: 11 };

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  const releaseStart = performance.now();

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    frightUntil: 0,    // performance.now() en el que termina el modo asustado; 0 = inactivo
    frightChain: 0,    // nº de fantasmas comidos en la fase actual (0..3 para score)
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g, i ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      released: false,
      releaseAt: releaseStart + ( i + 1 ) * GHOST_RELEASE_INTERVAL_MS,
      leftPen: false,
      mode: 'chase', // 'chase' | 'frightened' | 'eyes'
      startX: g.x,
      startY: g.y,
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1); ademas por puerta (3) si leftPen
//           (evita reentrada a la pen una vez fuera)
function isWall( grid, x, y, actor, leftPen ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && ( actor === 'pacman' || ( actor === 'ghost' && leftPen ) ) ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor, leftPen ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor, leftPen );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Comer power pellet: dispara modo asustado.
    if ( grid[ p.y ][ p.x ] === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += POWER_PELLET_SCORE;
      game.dotsRemaining--;
      game.frightUntil = performance.now() + FRIGHT_DURATION_MS;
      game.frightChain = 0;
      for ( const gh of game.ghosts ) {
        if ( gh.mode === 'chase' ) {
          gh.mode = 'frightened';
          // Reversion inmediata solo si ya salio de la pen.
          if ( gh.leftPen ) gh.dir = OPPOSITE[ gh.dir ];
        }
      }
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

function decideGhost( game, g ) {
  const grid = game.grid;
  const p = game.pacman;
  // leftPen efectivo: la puerta (3) vuelve a ser muro para todo leftPen (spec 04).
  const effLeftPen = g.leftPen;

  // Modo asustado: direccion aleatoria valida en cada cruce (sin perseguir).
  if ( g.mode === 'frightened' ) {
    const options = Object.keys( DIRS ).filter(
      ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost', effLeftPen )
    );
    const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost', effLeftPen )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  if ( g.kind === 'hunter' || g.kind === 'ambusher' || g.kind === 'patrol' ) {
    let tx, ty;
    if ( g.kind === 'hunter' ) {
      tx = Math.round( p.x );
      ty = Math.round( p.y );
    } else if ( g.kind === 'ambusher' ) {
      // ambusher: 4 celdas por delante de Pac-Man
      const pd = DIRS[ p.dir ] || DIRS.left;
      tx = Math.round( p.x ) + pd.x * AMBUSHER_AIM_STRIDE;
      ty = Math.round( p.y ) + pd.y * AMBUSHER_AIM_STRIDE;
    } else {
      // patrol: alterna entre PATROL_CORNERS
      if ( g.patrolTarget === undefined ) g.patrolTarget = 0;
      tx = PATROL_CORNERS[ g.patrolTarget ].x;
      ty = PATROL_CORNERS[ g.patrolTarget ].y;
      if ( Math.abs( g.x - tx ) + Math.abs( g.y - ty ) <= 1 ) {
        g.patrolTarget = ( g.patrolTarget + 1 ) % PATROL_CORNERS.length;
      }
    }
    let best = choices[ 0 ];
    let bestDist = Infinity;
    for ( const dir of choices ) {
      const d = DIRS[ dir ];
      const nx = g.x + d.x;
      const ny = g.y + d.y;
      const dist = Math.abs( nx - tx ) + Math.abs( ny - ty );
      if ( dist < bestDist ) {
        bestDist = dist;
        best = dir;
      }
    }
    g.dir = best;
  } else {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
  }
}

function exitPenStep( game, g ) {
  if ( Math.round( g.x ) !== PEN_EXIT.x ) {
    g.dir = g.x < PEN_EXIT.x ? 'right' : 'left';
  } else {
    g.dir = 'up';
  }
}

function moveGhost( game, g ) {
  if ( !g.released ) {
    if ( performance.now() < g.releaseAt ) return;
    g.released = true;
  }

  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );

    if ( g.released && !g.leftPen ) {
      if ( g.x === PEN_EXIT.x && g.y === PEN_EXIT.y ) {
        g.leftPen = true;
        decideGhost( game, g );
      } else {
        exitPenStep( game, g );
      }
    } else {
      decideGhost( game, g );
    }
    const effLeftPen = g.leftPen;
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost', effLeftPen ) ) return;
  }

  const d = DIRS[ g.dir ];
  let speed = g.speed;
  if ( g.mode === 'frightened' ) speed = FRIGHTENED_SPEED;
  else if ( g.mode === 'eyes' ) speed = EYES_SPEED;
  g.x += d.x * speed;
  g.y += d.y * speed;
  wrapTunnel( g, width );

  // Seguridad: si un fantasma sale del mapa (fuera de la fila del tunel), teleport a su start (spec 04).
  if ( Math.round( g.y ) !== TUNNEL_ROW && ( g.x < 0 || g.x > 27 || g.y < 0 || g.y > 31 ) ) {
    g.x = g.startX;
    g.y = g.startY;
    g.dir = 'up';
    g.mode = 'chase';
    g.leftPen = false;
    g.released = true;
    g.releaseAt = performance.now();
  }
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.frightUntil = 0;
  game.frightChain = 0;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.released = false;
    g.leftPen = false;
    g.mode = 'chase';
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  // Expiracion del modo asustado.
  if ( game.frightUntil > 0 && performance.now() >= game.frightUntil ) {
    game.frightUntil = 0;
    game.frightChain = 0;
    for ( const g of game.ghosts ) {
      if ( g.mode === 'frightened' ) g.mode = 'chase';
    }
  }

  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( !collides( game.pacman, g ) ) continue;
    if ( g.mode === 'frightened' ) {
      // Teleport directo a la celda de inicio dentro de la pen y re-exitar (spec 04).
      g.x = g.startX;
      g.y = g.startY;
      g.dir = 'up';
      g.mode = 'chase';
      g.leftPen = false;
      g.released = true;
      g.releaseAt = performance.now();
      game.score += GHOST_EAT_SCORES[ Math.min( game.frightChain, 3 ) ];
      game.frightChain++;
    } else if ( g.mode === 'eyes' ) {
      // Contacto con ojos: inofensivo.
      continue;
    } else {
      // chase: perder vida.
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      game.state = 'ready';
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

// Arranca la partida tras la pantalla "listo": reinicia timers de la pen y
// aplica la primera direccion elegida por el jugador.
function beginRound( game, initialDir ) {
  const now = performance.now();
  game.ghosts.forEach( ( g, i ) => {
    g.released = false;
    g.leftPen = false;
    g.releaseAt = now + ( i + 1 ) * GHOST_RELEASE_INTERVAL_MS;
  } );
  game.pacman.dir = initialDir;
  game.pacman.nextDir = null;
  game.state = 'playing';
}

window.createGame = createGame;
window.update = update;
window.beginRound = beginRound;
window.DIRS = DIRS;
