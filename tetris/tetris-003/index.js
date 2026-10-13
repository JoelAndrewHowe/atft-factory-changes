const { createBoard, createPiece, canPlace, lockPiece, clearLines } = require('./tetris');

function main() {
  console.log('Tetris - Initializing...');
  const board = createBoard();
  const piece = createPiece('T');
  console.log('Board created. Current piece:', piece.type);
}

if (require.main === module) {
  main();
}

module.exports = { main };
