const { createBoard, createPiece, moveLeft, moveRight, moveDown, rotatePiece, canPlace, lockPiece, clearLines, TETROMINOES, spawnPiece, tryRotate, lockAndClear } = require('./tetris');
const { clearScreen, project, format } = require('./render');

function main({ stdin, stdout, exit, colors = true, random = Math.random, board: initialBoard, piece: initialPiece, tickMs = 500, autoStart = true } = {}) {
  let board = initialBoard ? initialBoard.map((row) => [...row]) : createBoard();
  let piece = initialPiece ? { ...initialPiece, shape: initialPiece.shape.map((row) => [...row]) } : createPiece('T');
  let score = 0;
  let running = true;
  let timer = null;

  function draw() {
    clearScreen(stdout);
    const state = project(board, piece);
    stdout.write(format(state, score, colors) + '\n');
  }

  function doSpawnPiece() {
    return spawnPiece(random);
  }

  function endGame() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    clearScreen(stdout);
    stdout.write('GAME OVER\n');
    exit(0);
  }

  function settle(result) {
    board = result.board;
    score += result.linesCleared;
    piece = result.nextPiece;
    if (result.gameOver) {
      endGame();
      return true;
    }
    return false;
  }

  function tick() {
    if (!running) return;
    const moved = moveDown(board, piece);
    if (moved) {
      piece = moved;
      draw();
    } else {
      if (settle(lockAndClear(board, piece, doSpawnPiece))) return;
      draw();
    }
  }

  function hardDrop() {
    if (!running) return;
    let moved;
    while ((moved = moveDown(board, piece))) {
      piece = moved;
    }
    if (settle(lockAndClear(board, piece, doSpawnPiece))) return;
    draw();
  }

  function start() {
    if (!timer) {
      timer = setInterval(tick, tickMs);
    }
  }

  draw();
  if (autoStart) {
    start();
  }

  const onData = (key) => {
    const str = key.toString();
    if (str === 'q' || str === '\u0003') {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (stdin.isTTY) {
        stdin.setRawMode(false);
        stdin.pause();
      }
      clearScreen(stdout);
      stdout.write('Goodbye!\n');
      exit(0);
      return;
    }

    let moved = null;
    if (str === 'a' || str === 'A') {
      moved = moveLeft(board, piece);
    } else if (str === 'd' || str === 'D') {
      moved = moveRight(board, piece);
    } else if (str === 's' || str === 'S') {
      moved = moveDown(board, piece);
    } else if (str === 'w' || str === 'W') {
      moved = tryRotate(board, piece);
    } else if (str === ' ') {
      hardDrop();
      return;
    }

    if (moved) {
      piece = moved;
    } else if (str === 's' || str === 'S') {
      if (settle(lockAndClear(board, piece, doSpawnPiece))) return;
    }

    draw();
  };

  stdin.on('data', onData);

  if (stdin.isTTY) {
    stdin.setRawMode(true);
    stdin.resume();
  }

  return {
    get board() { return board.map((row) => [...row]); },
    get piece() { return { ...piece, shape: piece.shape.map((row) => [...row]) }; },
    get score() { return score; },
    get running() { return running; },
    get gameOver() { return !running; },
    tick,
    start,
    dispose() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
        stdin.pause();
      }
    },
  };
}

if (require.main === module) {
  main({ stdin: process.stdin, stdout: process.stdout, exit: process.exit });
}

module.exports = { main };
