// Lets Jest resolve "./x.js" imports to "./x.ts", but only when the .js file
// does not exist, so third-party packages are resolved exactly as normal.
module.exports = (request, options) => {
  try {
    return options.defaultResolver(request, options);
  } catch (error) {
    if (/^\.{1,2}\/.*\.js$/.test(request)) {
      return options.defaultResolver(request.slice(0, -3), options);
    }
    throw error;
  }
};
