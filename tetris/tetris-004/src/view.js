function createShowMessage(output = console.log) {
  return function showMessage(message) {
    output(message);
  };
}

const showMessage = createShowMessage();

module.exports = {
  showMessage,
  createShowMessage,
};
