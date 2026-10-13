# Plan: Tetris Terminal Game

## Tasks

- [x] Initialize Node.js project with `package.json` and an `npm start` script
- [x] Install terminal rendering/control packages if needed
- [x] Render the game board, borders, score, and controls within 24 terminal rows
  - [x] Fix clearScreen hardcoding process.stdout.write to make side effects observable
  - [x] Separate board/piece projection from terminal presentation (borders, colors, padding)
  - [x] Decouple main from process.stdin, process.stdout, and process.exit(0)
  - [x] Expose colors toggle in main() and render() instead of hardcoding true
- [x] Implement Tetris pieces (tetrominoes) and their rotations
- [x] Implement piece movement (left, right, down) and collision detection
- [x] Implement automatic falling and hard drop
- [x] Implement line clearing
- [x] Implement scoring (lines cleared)
- [x] Implement game-over detection and display a game-over message
- [x] Verify the game starts with `npm start` and total display fits within 24 rows
