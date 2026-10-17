const defaultReadline = require("readline");

function runGame(game, { render, tickInterval = 500, stdin, stdout = process.stdout, setTimer = setInterval, clearTimer = clearInterval, exitOnSignal = true, readline = defaultReadline, emitKeypressEventsStreams = new WeakSet() } = {}) {
  if (!stdin) {
    throw new Error("stdin is required");
  }

  let gameOver = false;
  let frameInterval;
  let quitMessage = null;
  let sigintHandler = null;
  let sigtermHandler = null;
  let uncaughtHandler = null;

  if (!emitKeypressEventsStreams.has(stdin)) {
    readline.emitKeypressEvents(stdin);
    emitKeypressEventsStreams.add(stdin);
  }
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();

  function draw() {
    const output = render(game);
    stdout.write("\x1B[2J\x1B[H" + output);
  }

  function quit(message) {
    clearTimer(frameInterval);
    stdin.removeListener("keypress", handleKeypress);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdin.pause();
    quitMessage = message;

    if (sigintHandler) {
      process.removeListener("SIGINT", sigintHandler);
      sigintHandler = null;
    }
    if (sigtermHandler) {
      process.removeListener("SIGTERM", sigtermHandler);
      sigtermHandler = null;
    }
    if (uncaughtHandler) {
      process.removeListener("uncaughtException", uncaughtHandler);
      uncaughtHandler = null;
    }
  }

  function handleKeypress(str, key) {
    if (!key) return;

    if (key.ctrl && key.name === "c") {
      quit("Quit");
      return;
    }

    if (gameOver) {
      quit("Game Over");
      return;
    }

    switch (key.name) {
      case "left":
      case "a":
        game.moveLeft();
        break;
      case "right":
      case "d":
        game.moveRight();
        break;
      case "up":
      case "w":
        game.rotate();
        break;
      case "down":
      case "s":
        game.moveDown();
        break;
      case "space":
        while (game.moveDown().moved) {}
        break;
      case "q":
        quit("Quit");
        return;
    }

    draw();
  }

  stdin.on("keypress", handleKeypress);

  function tick() {
    game.tick();
    const state = game.getState();
    if (state.gameOver) {
      gameOver = true;
      clearTimer(frameInterval);
      draw();
      return;
    }
    draw();
  }

  draw();
  frameInterval = setTimer(tick, tickInterval);

  if (stdin === process.stdin) {
    sigintHandler = () => {
      quit();
      if (exitOnSignal) {
        process.exit(0);
      }
    };
    sigtermHandler = () => {
      quit();
      if (exitOnSignal) {
        process.exit(0);
      }
    };
    uncaughtHandler = (err) => {
      stdout.write("\n" + err.message + "\n");
      quit();
      if (exitOnSignal) {
        process.exit(1);
      }
    };
    process.once("SIGINT", sigintHandler);
    process.once("SIGTERM", sigtermHandler);
    process.once("uncaughtException", uncaughtHandler);
  }

  return {
    quit: () => quit("Quit"),
    get quitMessage() {
      return quitMessage;
    },
  };
}

module.exports = {
  runGame,
};
