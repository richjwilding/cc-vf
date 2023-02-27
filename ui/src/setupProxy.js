const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/google', '/api/*', '/images/*'],
    createProxyMiddleware({
      target:  process.env.PROXY,
      //target:  'http://localhost:3001',
    })
  );
};