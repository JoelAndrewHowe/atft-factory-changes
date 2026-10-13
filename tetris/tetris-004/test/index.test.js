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
