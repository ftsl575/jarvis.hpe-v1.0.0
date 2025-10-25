const { fileURLToPath } = require('url');

module.exports = (request, options) => {
  if (request.startsWith('file://')) {
    const filePath = fileURLToPath(request);
    return options.defaultResolver(filePath, options);
  }

  return options.defaultResolver(request, options);
};
