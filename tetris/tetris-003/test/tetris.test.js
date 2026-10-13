const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  createBoard,
  createPiece,
  rotateMatrix,
  rotatePiece,
  canPlace,
  lockPiece,
  clearLines,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} = require('../tetris');

describe('Tetris Logic', () => {
  it('creates an empty board with correct dimensions', () => {
    const board = createBoard();
    assert.strictEqual(board.length, BOARD_HEIGHT);
    assert.strictEqual(board[0].length, BOARD_WIDTH);
    assert.ok(board.every((row) => row.every((cell) => cell === 0)));
  });

  it('creates a piece of the requested type', () => {
    const piece = createPiece('T');
    assert.strictEqual(piece.type, 'T');
    assert.ok(piece.shape.length > 0);
    assert.strictEqual(typeof piece.x, 'number');
    assert.strictEqual(typeof piece.y, 'number');
  });

  it('rotates a matrix 90 degrees clockwise', () => {
    const matrix = [
      [1, 0],
      [0, 1],
    ];
    const rotated = rotateMatrix(matrix);
    assert.deepStrictEqual(rotated, [
      [0, 1],
      [1, 0],
    ]);
  });

  it('detects valid and invalid placements', () => {
    const board = createBoard();
    const piece = createPiece('I');
    assert.ok(canPlace(board, piece.shape, piece.x, piece.y));
    assert.ok(!canPlace(board, piece.shape, -1, 0));
    assert.ok(!canPlace(board, piece.shape, 0, BOARD_HEIGHT));
  });

  it('locks a piece onto the board', () => {
    const board = createBoard();
    const piece = createPiece('O');
    piece.x = 0;
    piece.y = BOARD_HEIGHT - 2;
    lockPiece(board, piece);
    assert.ok(board[BOARD_HEIGHT - 2][0] === 'O');
    assert.ok(board[BOARD_HEIGHT - 2][1] === 'O');
    assert.ok(board[BOARD_HEIGHT - 1][0] === 'O');
    assert.ok(board[BOARD_HEIGHT - 1][1] === 'O');
  });

  it('clears full lines and returns the count', () => {
    const board = createBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[BOARD_HEIGHT - 1][x] = 'I';
    }
    const lines = clearLines(board);
    assert.strictEqual(lines, 1);
    assert.ok(board[BOARD_HEIGHT - 1].every((cell) => cell === 0));
  });

  it('rotates a piece without mutating the original', () => {
    const piece = createPiece('L');
    const originalShape = piece.shape.map((row) => [...row]);
    const rotated = rotatePiece(piece);
    assert.deepStrictEqual(piece.shape, originalShape);
    assert.notDeepStrictEqual(rotated.shape, originalShape);
  });
});
