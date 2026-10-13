const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

const TETROMINOES = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: 'cyan',
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: 'yellow',
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: 'magenta',
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: 'green',
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: 'red',
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: 'blue',
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: 'orange',
  },
};

function createBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
}

function createPiece(type) {
  const template = TETROMINOES[type];
  return {
    type,
    shape: template.shape.map((row) => [...row]),
    color: template.color,
    x: Math.floor(BOARD_WIDTH / 2) - Math.floor(template.shape[0].length / 2),
    y: 0,
  };
}

function rotateMatrix(matrix) {
  const N = matrix.length;
  const M = matrix[0].length;
  const result = Array.from({ length: M }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      result[j][N - 1 - i] = matrix[i][j];
    }
  }
  return result;
}

function rotatePiece(piece) {
  return {
    ...piece,
    shape: rotateMatrix(piece.shape),
  };
}

function canPlace(board, shape, x, y) {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const newX = x + col;
        const newY = y + row;
        if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
          return false;
        }
        if (newY >= 0 && board[newY][newX]) {
          return false;
        }
      }
    }
  }
  return true;
}

function lockPiece(board, piece) {
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const y = piece.y + row;
        const x = piece.x + col;
        if (y >= 0) {
          board[y][x] = piece.type;
        }
      }
    }
  }
}

function clearLines(board) {
  let linesCleared = 0;
  for (let row = board.length - 1; row >= 0; row--) {
    if (board[row].every((cell) => cell !== 0)) {
      board.splice(row, 1);
      board.unshift(Array(BOARD_WIDTH).fill(0));
      linesCleared++;
      row++;
    }
  }
  return linesCleared;
}

module.exports = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  TETROMINOES,
  createBoard,
  createPiece,
  rotateMatrix,
  rotatePiece,
  canPlace,
  lockPiece,
  clearLines,
};
