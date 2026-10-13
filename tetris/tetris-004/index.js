const { BOARD_WIDTH, BOARD_HEIGHT } = require("./src/constants");
const { createBoard } = require("./src/board");
const { getWelcomeMessage } = require("./src/welcome");
const { main } = require("./src/game");

module.exports = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  createBoard,
  getWelcomeMessage,
  main,
};

if (require.main === module) {
  main();
}
