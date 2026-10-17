function renderGame(game) {
  const state = game.getState();
  const { board, currentPiece, pieceX, pieceY, score, linesCleared, level, gameOver } = state;

  const BOARD_HEIGHT = board.length;
  const BOARD_WIDTH = board[0]?.length || 0;

  const displayGrid = board.map((row) => [...row]);
  if (currentPiece) {
    const shape = currentPiece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const y = pieceY + r;
          const x = pieceX + c;
          if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
            displayGrid[y][x] = 2;
          }
        }
      }
    }
  }

  const panelLines = [
    `Score: ${score}`,
    `Lines: ${linesCleared}`,
    `Level: ${level}`,
    "",
    "Controls:",
    "< > Move",
    "^ Rotate",
    "v Soft Drop",
    "Space HardDrop",
    "q Quit",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];

  const boardWidthChars = BOARD_WIDTH * 2;
  const panelWidth = 14;

  let result = "┌" + "─".repeat(boardWidthChars) + "┬" + "─".repeat(panelWidth) + "┐\n";

  for (let row = 0; row < BOARD_HEIGHT; row++) {
    let line = "│";
    for (let col = 0; col < BOARD_WIDTH; col++) {
      if (displayGrid[row][col] === 0) line += "  ";
      else if (displayGrid[row][col] === 2) line += "()";
      else line += "[]";
    }
    line += "│";
    const panelLine = panelLines[row] || "";
    line += panelLine.slice(0, panelWidth).padEnd(panelWidth, " ") + "│";
    result += line + "\n";
  }

  result += "└" + "─".repeat(boardWidthChars) + "┴" + "─".repeat(panelWidth) + "┘\n";

  if (gameOver) {
    result += "Game Over! Press any key to quit";
  } else {
    result += "< > Move  ^ Rotate  v Soft Drop  Space Hard Drop  q Quit";
  }

  return result;
}

function createShowMessage(output = console.log) {
  return function showMessage(message) {
    output(message);
  };
}

const showMessage = createShowMessage();

module.exports = {
  showMessage,
  createShowMessage,
  renderGame,
};
