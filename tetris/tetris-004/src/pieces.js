const PIECES = Object.freeze({
  I: Object.freeze([
    Object.freeze([0, 0, 0, 0]),
    Object.freeze([1, 1, 1, 1]),
    Object.freeze([0, 0, 0, 0]),
    Object.freeze([0, 0, 0, 0]),
  ]),
  J: Object.freeze([
    Object.freeze([1, 0, 0]),
    Object.freeze([1, 1, 1]),
    Object.freeze([0, 0, 0]),
  ]),
  L: Object.freeze([
    Object.freeze([0, 0, 1]),
    Object.freeze([1, 1, 1]),
    Object.freeze([0, 0, 0]),
  ]),
  O: Object.freeze([
    Object.freeze([1, 1]),
    Object.freeze([1, 1]),
  ]),
  S: Object.freeze([
    Object.freeze([0, 1, 1]),
    Object.freeze([1, 1, 0]),
    Object.freeze([0, 0, 0]),
  ]),
  T: Object.freeze([
    Object.freeze([0, 1, 0]),
    Object.freeze([1, 1, 1]),
    Object.freeze([0, 0, 0]),
  ]),
  Z: Object.freeze([
    Object.freeze([1, 1, 0]),
    Object.freeze([0, 1, 1]),
    Object.freeze([0, 0, 0]),
  ]),
});

const PIECE_TYPES = Object.keys(PIECES);

function getPieceShape(type) {
  const shape = PIECES[type];
  if (!shape) {
    throw new Error(`Unknown piece type: ${type}`);
  }
  return shape.map((row) => [...row]);
}

function rotateMatrix(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return result;
}

function rotateShape(type, rotation = 0) {
  let shape = getPieceShape(type);
  const normalizedRotation = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < normalizedRotation; i++) {
    shape = rotateMatrix(shape);
  }
  return shape;
}

function getPieceTypes() {
  return [...PIECE_TYPES];
}

function createPiece(type, rotation = 0) {
  let _type = type;
  let _rotation = ((rotation % 4) + 4) % 4;

  return {
    get type() {
      return _type;
    },
    get rotation() {
      return _rotation;
    },
    getShape() {
      return rotateShape(_type, _rotation);
    },
    rotate() {
      _rotation = (_rotation + 1) % 4;
      return this.getShape();
    },
  };
}

module.exports = {
  getPieceShape,
  rotateShape,
  getPieceTypes,
  createPiece,
};
