// queue_registry.js
const instances = new Map();

// optional: map queueName -> dynamic import
const loaders = {
  document: () => import('./document_queue.js'),
  ai:        () => import('./ai_queue.js'),
  enrich:    () => import('./enrich_queue.js'),
  query:     () => import('./query_queue.js'),
  brightdata:() => import('./brightdata_queue.js'),
  flow:      () => import('./flow_queue.js'),
  integration: () => import('./integration_queue.js'),
};

export function registerQueue(name, instance) {
  instances.set(name, instance);
  return instance;
}

export async function getQueue(name) {
  if (instances.has(name)) return instances.get(name);
  const load = loaders[name];
  console.log(`loading ${name}`)
  if (!load) throw new Error(`Unknown queue: ${name}`);
  // dynamic import avoids static cycles
  const mod = await load();
  // every queue file should export default: a function returning a singleton
  const inst = mod.default(); 
  instances.set(name, inst);
  return inst;
}
