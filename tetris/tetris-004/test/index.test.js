const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  createBoard,
  getWelcomeMessage,
  main,
  getPieceShape,
  rotateShape,
  getPieceTypes,
  createPiece,
  createGame,
} = require("../index.js");

describe("Tetris game basics", () => {
  it("exports correct board dimensions", () => {
    assert.strictEqual(BOARD_WIDTH, 10);
    assert.strictEqual(BOARD_HEIGHT, 20);
  });

  it("creates an empty board with correct dimensions", () => {
    const board = createBoard();
    assert.strictEqual(board.length, BOARD_HEIGHT);
    board.forEach((row) => {
      assert.strictEqual(row.length, BOARD_WIDTH);
      row.forEach((cell) => assert.strictEqual(cell, 0));
    });
  });

  it("returns the welcome message", () => {
    assert.strictEqual(getWelcomeMessage(), "Tetris");
  });

  it("main calls showMessage with the welcome text", () => {
    const messages = [];
    const mockShowMessage = (msg) => messages.push(msg);
    main({ showMessage: mockShowMessage });
    assert.strictEqual(messages.length, 1);
    assert.ok(messages[0].startsWith("Tetris"));
  });
});

describe("Tetris pieces", () => {
  it("exports all seven piece types", () => {
    const types = getPieceTypes();
    assert.deepStrictEqual(types.sort(), ["I", "J", "L", "O", "S", "T", "Z"]);
  });

  it("returns a shape for each piece type", () => {
    for (const type of getPieceTypes()) {
      const shape = getPieceShape(type);
      assert.ok(Array.isArray(shape));
      assert.ok(shape.length > 0);
      assert.ok(shape.every((row) => Array.isArray(row)));
    }
  });

  it("I piece has a 4x4 bounding box", () => {
    const shape = getPieceShape("I");
    assert.strictEqual(shape.length, 4);
    assert.ok(shape.every((row) => row.length === 4));
  });

  it("T piece has a 3x3 bounding box", () => {
    const shape = getPieceShape("T");
    assert.strictEqual(shape.length, 3);
    assert.ok(shape.every((row) => row.length === 3));
  });

  it("O piece has a 2x2 bounding box", () => {
    const shape = getPieceShape("O");
    assert.strictEqual(shape.length, 2);
    assert.ok(shape.every((row) => row.length === 2));
  });

  it("rotates a piece 90 degrees clockwise", () => {
    const original = getPieceShape("T");
    const rotated = rotateShape("T", 1);
    assert.notDeepStrictEqual(rotated, original);
    assert.strictEqual(rotated.length, original[0].length);
    assert.strictEqual(rotated[0].length, original.length);
  });

  it("four rotations return to the original shape", () => {
    const original = getPieceShape("S");
    const rotated = rotateShape("S", 4);
    assert.deepStrictEqual(rotated, original);
  });

  it("createPiece returns a piece with type and rotation", () => {
    const piece = createPiece("L");
    assert.strictEqual(piece.type, "L");
    assert.strictEqual(piece.rotation, 0);
  });

  it("createPiece getShape returns the initial shape", () => {
    const piece = createPiece("J");
    assert.deepStrictEqual(piece.getShape(), getPieceShape("J"));
  });

  it("piece rotate increments rotation and returns new shape", () => {
    const piece = createPiece("Z");
    const original = piece.getShape();
    const rotated = piece.rotate();
    assert.strictEqual(piece.rotation, 1);
    assert.notDeepStrictEqual(rotated, original);
  });

  it("piece rotation wraps after four rotations", () => {
    const piece = createPiece("I");
    for (let i = 0; i < 4; i++) {
      piece.rotate();
    }
    assert.strictEqual(piece.rotation, 0);
    assert.deepStrictEqual(piece.getShape(), getPieceShape("I"));
  });
});

describe("Board piece placement", () => {
  it("canPlace returns true for empty board at origin", () => {
    const board = createBoard();
    const shape = getPieceShape("O");
    assert.strictEqual(board.canPlace(shape, 0, 0), true);
  });

  it("canPlace returns false when out of bounds", () => {
    const board = createBoard();
    const shape = getPieceShape("O");
    assert.strictEqual(board.canPlace(shape, -1, 0), false);
    assert.strictEqual(board.canPlace(shape, 0, -1), false);
    assert.strictEqual(board.canPlace(shape, 9, 0), false);
    assert.strictEqual(board.canPlace(shape, 0, 19), false);
  });

  it("lockPiece writes piece to board", () => {
    const board = createBoard();
    const shape = getPieceShape("O");
    board.lockPiece(shape, 0, 0, 1);
    assert.strictEqual(board.getCell(0, 0), 1);
    assert.strictEqual(board.getCell(1, 0), 1);
    assert.strictEqual(board.getCell(0, 1), 1);
    assert.strictEqual(board.getCell(1, 1), 1);
    assert.strictEqual(board.getCell(2, 0), 0);
  });

  it("clearLines removes full rows and shifts down", () => {
    const board = createBoard();
    // Fill bottom row
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board.setCell(x, BOARD_HEIGHT - 1, 1);
    }
    // Fill second-to-last row except one cell
    for (let x = 0; x < BOARD_WIDTH - 1; x++) {
      board.setCell(x, BOARD_HEIGHT - 2, 1);
    }
    const cleared = board.clearLines();
    assert.strictEqual(cleared, 1);
    // The 9-cell row shifts down to the bottom
    assert.strictEqual(board.getCell(0, BOARD_HEIGHT - 1), 1);
    assert.strictEqual(board.getCell(9, BOARD_HEIGHT - 1), 0);
    assert.strictEqual(board.getCell(0, BOARD_HEIGHT - 2), 0);
  });

  it("canPlace returns false when overlapping locked cells", () => {
    const board = createBoard();
    const shape = getPieceShape("O");
    board.lockPiece(shape, 0, 0, 1);
    assert.strictEqual(board.canPlace(shape, 0, 0), false);
  });
});

describe("Game loop", () => {
  it("createGame returns a game object", () => {
    const game = createGame();
    assert.ok(game);
    assert.ok(game.board);
    assert.strictEqual(game.score, 0);
    assert.strictEqual(game.linesCleared, 0);
    assert.strictEqual(game.level, 1);
    assert.strictEqual(game.gameOver, false);
  });

  it("spawnPiece places a piece at the top", () => {
    const game = createGame();
    const result = game.spawnPiece();
    assert.strictEqual(result.success, true);
    assert.ok(game.currentPiece);
    assert.strictEqual(game.pieceY, 0);
  });

  it("createGame accepts injected random to control piece type", () => {
    const game = createGame({ random: () => 0.99 });
    const result = game.spawnPiece();
    const types = getPieceTypes();
    const expectedType = types[types.length - 1];
    assert.strictEqual(result.type, expectedType);
  });

  it("createGame accepts injected board", () => {
    const board = createBoard();
    const game = createGame({ board });
    assert.notStrictEqual(game.board, board);
    assert.strictEqual(game.board.width, board.width);
    assert.strictEqual(game.board.height, board.height);
  });

  it("createGame accepts injected pieceFactory", () => {
    const customPiece = createPiece("O");
    const game = createGame({
      createPiece: () => customPiece,
      random: () => 0,
    });
    game.spawnPiece();
    assert.notStrictEqual(game.currentPiece, customPiece);
    assert.strictEqual(game.currentPiece.type, customPiece.type);
  });

  it("tick moves piece down with gravity", () => {
    const game = createGame();
    game.spawnPiece();
    const startY = game.pieceY;
    game.tick();
    assert.strictEqual(game.pieceY, startY + 1);
  });

  it("tick locks piece when it hits bottom", () => {
    const game = createGame();
    game.spawnPiece();
    // Tick until piece hits bottom
    for (let i = 0; i < BOARD_HEIGHT + 2; i++) {
      game.tick();
    }
    // The piece should have been locked and a new piece spawned
    assert.ok(game.currentPiece !== null || game.gameOver);
    // Verify some cells were locked to the board
    let hasLockedCells = false;
    game.board.forEach((row) => {
      if (row.some((cell) => cell !== 0)) hasLockedCells = true;
    });
    assert.ok(hasLockedCells, "Piece should have been locked to the board");
  });

  it("moveLeft moves piece left", () => {
    const game = createGame();
    game.spawnPiece();
    const startX = game.pieceX;
    const result = game.moveLeft();
    assert.strictEqual(result.moved, true);
    assert.strictEqual(game.pieceX, startX - 1);
  });

  it("moveRight moves piece right", () => {
    const game = createGame();
    game.spawnPiece();
    const startX = game.pieceX;
    const result = game.moveRight();
    assert.strictEqual(result.moved, true);
    assert.strictEqual(game.pieceX, startX + 1);
  });

  it("moveDown moves piece down", () => {
    const game = createGame();
    game.spawnPiece();
    const startY = game.pieceY;
    const result = game.moveDown();
    assert.strictEqual(result.moved, true);
    assert.strictEqual(game.pieceY, startY + 1);
  });

  it("rotate rotates the current piece", () => {
    const game = createGame();
    game.spawnPiece();
    const startRotation = game.currentPiece.rotation;
    const result = game.rotate();
    assert.strictEqual(result.rotated, true);
    assert.strictEqual(game.currentPiece.rotation, (startRotation + 1) % 4);
  });

  it("tick returns detailed transition info", () => {
    const game = createGame();
    const result = game.tick();
    assert.strictEqual(result.spawned, true);
    assert.strictEqual(result.gameOver, false);
  });

  it("clearLines increases score through game API", () => {
    const board = createBoard();
    // Fill the bottom row completely
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board.setCell(x, BOARD_HEIGHT - 1, 1);
    }
    const game = createGame({ board, random: () => 0 });
    game.spawnPiece();
    // Drop the piece until it locks
    while (true) {
      const result = game.moveDown();
      if (!result.moved) break;
    }
    // The bottom row was already full before the piece locked.
    // When lockPiece called clearLines, it should have cleared that row.
    assert.strictEqual(game.linesCleared, 1);
    assert.strictEqual(game.score, 100);
  });

  it("getState returns defensive copies", () => {
    const game = createGame({ random: () => 0 });
    game.spawnPiece();
    const state = game.getState();
    if (state.currentPiece) {
      state.currentPiece.type = "X";
    }
    assert.notStrictEqual(game.currentPiece.type, "X");
    state.board[0][0] = 99;
    assert.strictEqual(game.board.getCell(0, 0), 0);
  });
});

describe("Scoring and level tracking", () => {
  it("score starts at zero", () => {
    const game = createGame();
    assert.strictEqual(game.score, 0);
  });

  it("level increases every 10 lines", () => {
    const board = createBoard();
    // Fill rows 10..19 completely so a single lock clears 10 lines
    for (let y = 10; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        board.setCell(x, y, 1);
      }
    }
    const game = createGame({ board, random: () => 0.5 });
    game.spawnPiece();
    while (game.moveDown().moved) {}
    assert.strictEqual(game.linesCleared, 10);
    assert.strictEqual(game.level, 2);
  });

  it("score is multiplied by level", () => {
    const board = createBoard();
    for (let y = 10; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        board.setCell(x, y, 1);
      }
    }
    const game = createGame({ board, random: () => 0.5 });
    game.spawnPiece();
    while (game.moveDown().moved) {}
    // 10 lines cleared at level 1 => 10 * 100 * 1 = 1000
    assert.strictEqual(game.score, 1000);
  });

  it("getState includes level", () => {
    const game = createGame();
    game.spawnPiece();
    const state = game.getState();
    assert.strictEqual(state.level, 1);
  });
});
