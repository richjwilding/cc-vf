// server/bin/boot.js
function isWorkerRole() {
  const role = (process.env.ROLE || process.env.GAE_SERVICE || '').toLowerCase();
  return role === 'worker' || role.includes('worker');
}

if (isWorkerRole()) {
  // Start the worker bootstrap (has /healthz HTTP server)
  require('./worker');  
} else {
  // Start the web server
  require('./www');     
}