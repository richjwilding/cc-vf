const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/google', '/miro/', '/api/*', '/images/*', '/socket.io/*'],
    createProxyMiddleware({
      target:  process.env.PROXY,
      //target:  'http://localhost:3001',
    })
  );
};