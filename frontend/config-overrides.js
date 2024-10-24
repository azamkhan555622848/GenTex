const path = require('path');

module.exports = function override(config, env) {
  config.resolve.alias = {
    ...config.resolve.alias,
    'pdfjs-dist': path.join(__dirname, './node_modules/pdfjs-dist/build/pdf.js'),
  };
  return config;
};
