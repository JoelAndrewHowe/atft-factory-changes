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
  moveLeft,
  moveRight,
  moveDown,
  spawnPiece,
  tryRotate,
  lockAndClear,
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

  it('moves a piece left when valid', () => {
    const board = createBoard();
    const piece = createPiece('T');
    const originalX = piece.x;
    const moved = moveLeft(board, piece);
    assert.ok(moved);
    assert.strictEqual(moved.x, originalX - 1);
    assert.strictEqual(moved.y, piece.y);
  });

  it('does not move a piece left when blocked by the wall', () => {
    const board = createBoard();
    const piece = createPiece('T');
    piece.x = 0;
    const moved = moveLeft(board, piece);
    assert.strictEqual(moved, null);
  });

  it('does not move a piece left when blocked by a locked piece', () => {
    const board = createBoard();
    const locked = createPiece('O');
    locked.x = 2;
    locked.y = 0;
    lockPiece(board, locked);
    const piece = createPiece('T');
    piece.x = 4;
    piece.y = 0;
    const moved = moveLeft(board, piece);
    assert.strictEqual(moved, null);
  });

  it('moves a piece right when valid', () => {
    const board = createBoard();
    const piece = createPiece('O');
    const originalX = piece.x;
    const moved = moveRight(board, piece);
    assert.ok(moved);
    assert.strictEqual(moved.x, originalX + 1);
  });

  it('does not move a piece right when blocked by the wall', () => {
    const board = createBoard();
    const piece = createPiece('O');
    piece.x = BOARD_WIDTH - 2;
    const moved = moveRight(board, piece);
    assert.strictEqual(moved, null);
  });

  it('does not move a piece right when blocked by a locked piece', () => {
    const board = createBoard();
    const locked = createPiece('O');
    locked.x = 6;
    locked.y = 0;
    lockPiece(board, locked);
    const piece = createPiece('T');
    piece.x = 4;
    piece.y = 0;
    const moved = moveRight(board, piece);
    assert.strictEqual(moved, null);
  });

  it('moves a piece down when valid', () => {
    const board = createBoard();
    const piece = createPiece('I');
    const originalY = piece.y;
    const moved = moveDown(board, piece);
    assert.ok(moved);
    assert.strictEqual(moved.y, originalY + 1);
    assert.strictEqual(moved.x, piece.x);
  });

  it('does not move a piece down when blocked by the floor', () => {
    const board = createBoard();
    const piece = createPiece('O');
    piece.y = BOARD_HEIGHT - 2;
    const moved = moveDown(board, piece);
    assert.strictEqual(moved, null);
  });

  it('does not move a piece down when blocked by a locked piece', () => {
    const board = createBoard();
    const locked = createPiece('O');
    locked.x = 4;
    locked.y = 18;
    lockPiece(board, locked);
    const piece = createPiece('T');
    piece.x = 4;
    piece.y = 16;
    const moved = moveDown(board, piece);
    assert.strictEqual(moved, null);
  });

  it('spawns a random piece of a valid type', () => {
    const piece = spawnPiece(() => 0.5);
    assert.ok(['I', 'O', 'T', 'S', 'Z', 'J', 'L'].includes(piece.type));
    assert.ok(canPlace(createBoard(), piece.shape, piece.x, piece.y));
  });

  it('spawns a deterministic piece with a seeded random', () => {
    const piece = spawnPiece(() => 0);
    assert.strictEqual(piece.type, 'I');
  });

  it('rotates a piece when valid', () => {
    const board = createBoard();
    const piece = createPiece('T');
    const rotated = tryRotate(board, piece);
    assert.ok(rotated);
    assert.notDeepStrictEqual(rotated.shape, piece.shape);
  });

  it('does not rotate a piece when blocked by the wall', () => {
    const board = createBoard();
    const piece = createPiece('L');
    piece.x = 8;
    const rotated = tryRotate(board, piece);
    assert.strictEqual(rotated, null);
  });

  it('does not rotate a piece when blocked by a locked piece', () => {
    const board = createBoard();
    const locked = createPiece('O');
    locked.x = 5;
    locked.y = 2;
    lockPiece(board, locked);
    const piece = createPiece('T');
    piece.x = 4;
    piece.y = 0;
    const rotated = tryRotate(board, piece);
    assert.strictEqual(rotated, null);
  });

  it('lockAndClear locks the piece onto the board', () => {
    const board = createBoard();
    const piece = createPiece('O');
    piece.x = 0;
    piece.y = 0;
    const result = lockAndClear(board, piece, () => createPiece('I'));
    assert.strictEqual(result.board[0][0], 'O');
    assert.strictEqual(result.board[0][1], 'O');
    assert.strictEqual(result.board[1][0], 'O');
    assert.strictEqual(result.board[1][1], 'O');
  });

  it('lockAndClear clears completed lines', () => {
    const board = createBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[BOARD_HEIGHT - 1][x] = 'I';
    }
    const piece = createPiece('O');
    piece.x = 0;
    piece.y = BOARD_HEIGHT - 3;
    const result = lockAndClear(board, piece, () => createPiece('I'));
    assert.strictEqual(result.linesCleared, 1);
    assert.ok(result.board[0].every((cell) => cell === 0));
  });

  it('lockAndClear spawns the next piece', () => {
    const board = createBoard();
    const piece = createPiece('T');
    const next = createPiece('J');
    const result = lockAndClear(board, piece, () => next);
    assert.strictEqual(result.nextPiece.type, 'J');
  });

  it('lockAndClear detects game over when the next piece cannot spawn', () => {
    const board = createBoard();
    board[0][4] = 'I';
    const piece = createPiece('T');
    piece.x = 0;
    piece.y = 0;
    const result = lockAndClear(board, piece, () => createPiece('O'));
    assert.strictEqual(result.gameOver, true);
  });

  it('lockAndClear coordination: lock, clear, spawn, no game over', () => {
    const board = createBoard();
    for (let x = 3; x < BOARD_WIDTH; x++) {
      board[18][x] = 'I';
    }
    const piece = createPiece('T');
    piece.x = 0;
    piece.y = 17;
    const next = createPiece('O');
    const result = lockAndClear(board, piece, () => next);
    assert.strictEqual(result.board[18][1], 'T');
    assert.strictEqual(result.linesCleared, 1);
    assert.strictEqual(result.nextPiece.type, 'O');
    assert.strictEqual(result.gameOver, false);
  });
});
