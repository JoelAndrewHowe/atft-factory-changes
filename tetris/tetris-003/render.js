const chalk = require('chalk');

const COLORS = {
  I: chalk.cyanBright,
  O: chalk.yellowBright,
  T: chalk.magentaBright,
  S: chalk.greenBright,
  Z: chalk.redBright,
  J: chalk.blueBright,
  L: chalk.hex('#FFA500'),
};

const BLOCK = '██';
const EMPTY = '  ';

function clearScreen(output) {
  output.write('\x1b[2J\x1b[H');
}

function project(board, piece) {
  const display = board.map((row) => [...row]);

  if (piece) {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) {
          const y = piece.y + r;
          const x = piece.x + c;
          if (y >= 0 && y < display.length && x >= 0 && x < display[0].length) {
            display[y][x] = piece.type;
          }
        }
      }
    }
  }

  return display;
}

function format(projected, score = 0, colors = false) {
  const width = projected[0].length;
  const innerWidth = width * 2;

  const topContent = ' TETRIS ';
  const topPadLeft = Math.floor((innerWidth - topContent.length) / 2);
  const topPadRight = innerWidth - topContent.length - topPadLeft;
  const top = '┌' + '─'.repeat(topPadLeft) + topContent + '─'.repeat(topPadRight) + '┐';

  const rows = [top];

  for (let y = 0; y < projected.length; y++) {
    let line = '│';
    for (let x = 0; x < width; x++) {
      const cell = projected[y][x];
      if (cell) {
        if (colors) {
          const colorFn = COLORS[cell] || chalk.white;
          line += colorFn(BLOCK);
        } else {
          line += BLOCK;
        }
      } else {
        line += EMPTY;
      }
    }
    line += '│';
    rows.push(line);
  }

  const scoreContent = ` Score: ${score} `;
  const scorePadLeft = Math.floor((innerWidth - scoreContent.length) / 2);
  const scorePadRight = innerWidth - scoreContent.length - scorePadLeft;
  const bottom = '└' + '─'.repeat(scorePadLeft) + scoreContent + '─'.repeat(scorePadRight) + '┘';
  rows.push(bottom);

  rows.push('A/D/S:move  W:rotate  ');
  rows.push('Q:quit    Space:drop  ');

  return rows.join('\n');
}

function render(board, piece, score = 0, colors = true) {
  return format(project(board, piece), score, colors);
}

module.exports = { clearScreen, project, format, render };
