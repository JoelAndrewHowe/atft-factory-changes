const { BOARD_WIDTH, BOARD_HEIGHT } = require("./src/constants");
const { createBoard } = require("./src/board");
const { getWelcomeMessage } = require("./src/welcome");
const { main } = require("./src/game");
const {
  getPieceShape,
  rotateShape,
  getPieceTypes,
  createPiece,
} = require("./src/pieces");

module.exports = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  createBoard,
  getWelcomeMessage,
  main,
  getPieceShape,
  rotateShape,
  getPieceTypes,
  createPiece,
};

if (require.main === module) {
  main();
}
