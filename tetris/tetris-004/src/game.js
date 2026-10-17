const { createBoard, createReadOnlyBoard } = require("./board");
const { createPiece, getPieceTypes, rotateShape } = require("./pieces");
const { getWelcomeMessage } = require("./welcome");
const { runGame } = require("./terminal");
const { renderGame } = require("./view");

function createGame({
  board = createBoard(),
  createPiece: pieceFactory = createPiece,
  random = Math.random,
} = {}) {
  let currentPiece = null;
  let pieceX = 0;
  let pieceY = 0;
  let score = 0;
  let linesCleared = 0;
  let level = 1;
  let gameOver = false;

  function spawnPiece() {
    const types = getPieceTypes();
    const type = types[Math.floor(random() * types.length)];
    const piece = pieceFactory(type);
    const shape = piece.getShape();
    const shapeWidth = shape[0].length;
    const x = Math.floor((board.width - shapeWidth) / 2);
    const y = 0;

    if (!board.canPlace(shape, x, y)) {
      gameOver = true;
      return { success: false, gameOver: true, type: null, x: null, y: null };
    }

    currentPiece = piece;
    pieceX = x;
    pieceY = y;
    return { success: true, gameOver: false, type, x, y };
  }

  function lockPiece() {
    if (!currentPiece) return { linesCleared: 0, scoreAdded: 0 };
    board.lockPiece(currentPiece.getShape(), pieceX, pieceY, 1);
    currentPiece = null;
    const cleared = board.clearLines();
    let scoreAdded = 0;
    if (cleared > 0) {
      scoreAdded = cleared * 100 * level;
      linesCleared += cleared;
      level = Math.floor(linesCleared / 10) + 1;
      score += scoreAdded;
    }
    return { linesCleared: cleared, scoreAdded };
  }

  function lockAndSpawn() {
    const lockResult = lockPiece();
    if (gameOver) {
      return { moved: false, spawned: false, locked: true, gameOver: true, linesCleared: lockResult.linesCleared, scoreAdded: lockResult.scoreAdded, pieceX, pieceY };
    }
    const spawnResult = spawnPiece();
    return { moved: false, spawned: spawnResult.success, locked: true, gameOver: spawnResult.gameOver, linesCleared: lockResult.linesCleared, scoreAdded: lockResult.scoreAdded, pieceX, pieceY };
  }

  function tick() {
    if (gameOver) return { moved: false, spawned: false, locked: false, gameOver: true, linesCleared: 0, scoreAdded: 0, pieceX, pieceY };

    if (!currentPiece) {
      const result = spawnPiece();
      return { moved: false, spawned: result.success, locked: false, gameOver: result.gameOver, linesCleared: 0, scoreAdded: 0, pieceX, pieceY };
    }

    const shape = currentPiece.getShape();
    if (board.canPlace(shape, pieceX, pieceY + 1)) {
      pieceY++;
      return { moved: true, spawned: false, locked: false, gameOver: false, linesCleared: 0, scoreAdded: 0, pieceX, pieceY };
    }
    return lockAndSpawn();
  }

  function moveLeft() {
    if (gameOver || !currentPiece) return { moved: false, pieceX, pieceY };
    const shape = currentPiece.getShape();
    if (board.canPlace(shape, pieceX - 1, pieceY)) {
      pieceX--;
      return { moved: true, pieceX, pieceY };
    }
    return { moved: false, pieceX, pieceY };
  }

  function moveRight() {
    if (gameOver || !currentPiece) return { moved: false, pieceX, pieceY };
    const shape = currentPiece.getShape();
    if (board.canPlace(shape, pieceX + 1, pieceY)) {
      pieceX++;
      return { moved: true, pieceX, pieceY };
    }
    return { moved: false, pieceX, pieceY };
  }

  function moveDown() {
    if (gameOver || !currentPiece) return { moved: false, spawned: false, locked: false, gameOver, linesCleared: 0, scoreAdded: 0, pieceX, pieceY };
    const shape = currentPiece.getShape();
    if (board.canPlace(shape, pieceX, pieceY + 1)) {
      pieceY++;
      return { moved: true, spawned: false, locked: false, gameOver: false, linesCleared: 0, scoreAdded: 0, pieceX, pieceY };
    }
    return lockAndSpawn();
  }

  function rotate() {
    if (gameOver || !currentPiece) return { rotated: false, rotation: null };
    const nextRotation = (currentPiece.rotation + 1) % 4;
    const rotatedShape = rotateShape(currentPiece.type, nextRotation);
    if (board.canPlace(rotatedShape, pieceX, pieceY)) {
      currentPiece.rotate();
      return { rotated: true, rotation: currentPiece.rotation };
    }
    return { rotated: false, rotation: currentPiece.rotation };
  }

  function getState() {
    return {
      board: board.toGrid(),
      currentPiece: currentPiece
        ? { type: currentPiece.type, rotation: currentPiece.rotation, shape: currentPiece.getShape() }
        : null,
      pieceX,
      pieceY,
      score,
      linesCleared,
      level,
      gameOver,
    };
  }

  return {
    get board() {
      return createReadOnlyBoard(board);
    },
    get score() {
      return score;
    },
    get linesCleared() {
      return linesCleared;
    },
    get level() {
      return level;
    },
    get gameOver() {
      return gameOver;
    },
    get currentPiece() {
      return currentPiece
        ? { type: currentPiece.type, rotation: currentPiece.rotation, shape: currentPiece.getShape() }
        : null;
    },
    get pieceX() {
      return pieceX;
    },
    get pieceY() {
      return pieceY;
    },
    spawnPiece,
    tick,
    moveLeft,
    moveRight,
    moveDown,
    rotate,
    lockPiece,
    getState,
  };
}

function main(options = {}) {
  if (options && "showMessage" in options) {
    options.showMessage(getWelcomeMessage());
    return;
  }

  const gameFactory = options.createGame || createGame;
  const runner = options.runGame || runGame;
  const renderer = options.render || renderGame;
  const game = gameFactory();
  runner(game, { render: renderer, stdin: options.stdin || process.stdin, stdout: options.stdout || process.stdout });
}

module.exports = {
  createGame,
  main,
};
