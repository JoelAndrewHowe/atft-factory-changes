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
    canPlace(shape, x, y) {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const boardX = x + c;
            const boardY = y + r;
            if (
              boardX < 0 ||
              boardX >= BOARD_WIDTH ||
              boardY < 0 ||
              boardY >= BOARD_HEIGHT ||
              grid[boardY][boardX] !== 0
            ) {
              return false;
            }
          }
        }
      }
      return true;
    },
    lockPiece(shape, x, y, value = 1) {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const boardX = x + c;
            const boardY = y + r;
            if (boardX >= 0 && boardX < BOARD_WIDTH && boardY >= 0 && boardY < BOARD_HEIGHT) {
              grid[boardY][boardX] = value;
            }
          }
        }
      }
    },
    clearLines() {
      let cleared = 0;
      for (let r = BOARD_HEIGHT - 1; r >= 0; r--) {
        if (grid[r].every((cell) => cell !== 0)) {
          grid.splice(r, 1);
          grid.unshift(Array(BOARD_WIDTH).fill(0));
          cleared++;
          r++; // re-check this row
        }
      }
      return cleared;
    },
  };
}

function createReadOnlyBoard(board) {
  return {
    get width() {
      return board.width;
    },
    get height() {
      return board.height;
    },
    get length() {
      return board.length;
    },
    forEach(callback) {
      board.forEach(callback);
    },
    [Symbol.iterator]() {
      return board[Symbol.iterator]();
    },
    toGrid() {
      return board.toGrid();
    },
    getCell(x, y) {
      return board.getCell(x, y);
    },
    canPlace(shape, x, y) {
      return board.canPlace(shape, x, y);
    },
  };
}

module.exports = {
  createBoard,
  createReadOnlyBoard,
};
