// next.config.js (à la racine du repo)
const path = require('path');

module.exports = {
  outputFileTracingRoot: path.join(__dirname), // force la racine = ce projet
};
