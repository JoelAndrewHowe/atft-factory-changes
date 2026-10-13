const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  createBoard,
  getWelcomeMessage,
  main,
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
