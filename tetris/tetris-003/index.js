const { createBoard, createPiece } = require('./tetris');
const { clearScreen, project, format } = require('./render');

function main({ stdin, stdout, exit, colors = true }) {
  const board = createBoard();
  const piece = createPiece('T');

  clearScreen(stdout);
  const state = project(board, piece);
  stdout.write(format(state, 0, colors) + '\n');

  const onData = (key) => {
    const str = key.toString();
    if (str === 'q' || str === '\u0003') {
      if (stdin.isTTY) {
        stdin.setRawMode(false);
        stdin.pause();
      }
      clearScreen(stdout);
      stdout.write('Goodbye!\n');
      exit(0);
    }
  };

  stdin.on('data', onData);

  if (stdin.isTTY) {
    stdin.setRawMode(true);
    stdin.resume();
  }

  return {
    board,
    piece,
    score: 0,
    dispose() {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
        stdin.pause();
      }
    },
  };
}

if (require.main === module) {
  main({ stdin: process.stdin, stdout: process.stdout, exit: process.exit });
}

module.exports = { main };
