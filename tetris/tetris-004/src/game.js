const { getWelcomeMessage } = require("./welcome");
const { showMessage: defaultShowMessage } = require("./view");

function main({ showMessage = defaultShowMessage } = {}) {
  showMessage(getWelcomeMessage() + " - coming soon!");
}

module.exports = {
  main,
};
