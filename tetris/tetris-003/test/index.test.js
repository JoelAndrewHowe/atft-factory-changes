const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { main } = require('../index');
const { BOARD_WIDTH, BOARD_HEIGHT, createBoard, createPiece } = require('../tetris');

function createMockStdin() {
  const stdin = new EventEmitter();
  stdin.isTTY = false;
  return stdin;
}

function createMockStdout() {
  return {
    writes: [],
    write(str) {
      this.writes.push(str);
    },
  };
}

describe('Tetris Main', () => {
  it('returns a state object with board, piece, score, and dispose', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const state = main({ stdin, stdout, exit: () => {} });
    assert.ok(Array.isArray(state.board));
    assert.strictEqual(state.board.length, BOARD_HEIGHT);
    assert.ok(state.piece);
    assert.strictEqual(state.score, 0);
    assert.strictEqual(typeof state.dispose, 'function');
    state.dispose();
  });

  it('moves piece left on a input', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const state = main({ stdin, stdout, exit: () => {} });
    const initialX = state.piece.x;
    stdin.emit('data', Buffer.from('a'));
    assert.strictEqual(state.piece.x, initialX - 1);
    state.dispose();
  });

  it('moves piece right on d input', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const state = main({ stdin, stdout, exit: () => {} });
    const initialX = state.piece.x;
    stdin.emit('data', Buffer.from('d'));
    assert.strictEqual(state.piece.x, initialX + 1);
    state.dispose();
  });

  it('moves piece down on s input', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const state = main({ stdin, stdout, exit: () => {} });
    const initialY = state.piece.y;
    stdin.emit('data', Buffer.from('s'));
    assert.strictEqual(state.piece.y, initialY + 1);
    state.dispose();
  });

  it('rotates piece on w input', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const state = main({ stdin, stdout, exit: () => {} });
    const originalShape = state.piece.shape.map((r) => [...r]);
    stdin.emit('data', Buffer.from('w'));
    assert.notDeepStrictEqual(state.piece.shape, originalShape);
    state.dispose();
  });

  it('exits on q input', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    let exitCode = null;
    const state = main({
      stdin,
      stdout,
      exit: (code) => {
        exitCode = code;
      },
    });
    stdin.emit('data', Buffer.from('q'));
    assert.strictEqual(exitCode, 0);
    assert.ok(stdout.writes.some((w) => w.includes('Goodbye!')));
    state.dispose();
  });

  it('accumulates score when a line is cleared on lock', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const board = createBoard();
    for (let x = 4; x < BOARD_WIDTH; x++) {
      board[BOARD_HEIGHT - 1][x] = 'O';
    }
    const piece = createPiece('I');
    piece.x = 0;
    piece.y = BOARD_HEIGHT - 2;

    const state = main({
      stdin,
      stdout,
      exit: () => {},
      random: () => 0,
      board,
      piece,
      autoStart: false,
    });

    stdin.emit('data', Buffer.from('s'));

    assert.strictEqual(state.score, 1);
    state.dispose();
  });

  it('ends the game on game over', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    let exitCode = null;
    const board = createBoard();
    // Block I-piece spawn: its horizontal bar at row 1 occupies x=4..7
    for (let x = 4; x <= 7; x++) {
      board[1][x] = 'I';
    }

    const piece = createPiece('O');
    piece.x = 0;
    piece.y = BOARD_HEIGHT - 2;

    const state = main({
      stdin,
      stdout,
      exit: (code) => {
        exitCode = code;
      },
      random: () => 0,
      board,
      piece,
      autoStart: false,
    });

    stdin.emit('data', Buffer.from('s'));

    assert.strictEqual(exitCode, 0);
    assert.ok(stdout.writes.some((w) => w.includes('GAME OVER')));
    state.dispose();
  });

  it('hard drops piece to the bottom on space input', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const board = createBoard();
    const piece = createPiece('O');
    piece.x = 0;
    piece.y = 0;

    const state = main({
      stdin,
      stdout,
      exit: () => {},
      random: () => 0,
      board,
      piece,
      autoStart: false,
    });

    stdin.emit('data', Buffer.from(' '));
    assert.strictEqual(state.board[BOARD_HEIGHT - 2][0], 'O');
    assert.strictEqual(state.board[BOARD_HEIGHT - 2][1], 'O');
    assert.strictEqual(state.board[BOARD_HEIGHT - 1][0], 'O');
    assert.strictEqual(state.board[BOARD_HEIGHT - 1][1], 'O');
    state.dispose();
  });

  it('auto-falls piece on tick', () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const board = createBoard();
    const piece = createPiece('O');
    piece.x = 0;
    piece.y = 0;

    const state = main({
      stdin,
      stdout,
      exit: () => {},
      board,
      piece,
      autoStart: false,
    });

    const initialY = state.piece.y;
    state.tick();
    assert.strictEqual(state.piece.y, initialY + 1);
    state.dispose();
  });
});
