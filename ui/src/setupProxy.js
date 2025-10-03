const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/google', '/logout', '/auth/', '/stripe', '/api/*', '/images/*', '/socket.io/*','/published/*', 'integrations'],
    createProxyMiddleware({
      target:  process.env.PROXY,
      //target:  'http://localhost:3001',
    })
  );
};