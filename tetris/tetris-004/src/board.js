const { BOARD_WIDTH, BOARD_HEIGHT } = require("./constants");

function createBoard() {
  const grid = Array.from({ length: BOARD_HEIGHT }, () =>
    Array(BOARD_WIDTH).fill(0)
  );

  return {
    get width() {
      return BOARD_WIDTH;
    },
    get height() {
      return BOARD_HEIGHT;
    },
    get length() {
      return grid.length;
    },
    forEach(callback) {
      grid.forEach((row, index) => callback([...row], index));
    },
    [Symbol.iterator]() {
      let rowIndex = 0;
      return {
        next() {
          if (rowIndex < grid.length) {
            const value = [...grid[rowIndex]];
            rowIndex++;
            return { value, done: false };
          }
          return { done: true };
        },
      };
    },
    toGrid() {
      return grid.map(row => [...row]);
    },
    getCell(x, y) {
      if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) {
        return undefined;
      }
      return grid[y][x];
    },
    setCell(x, y, value) {
      if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) {
        return false;
      }
      grid[y][x] = value;
      return true;
    },
  };
}

module.exports = {
  createBoard,
};
