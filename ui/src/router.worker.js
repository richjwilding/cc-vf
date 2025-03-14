/* eslint-env worker */
/* eslint-disable no-restricted-globals */

const classTracker = {}

class MinHeap {
  constructor() {
    this.heap = [];
    this.nodePosition = new Map(); // Maps node => index in heap
  }

  /**
   * Inserts a node into the heap.
   * If the node is already present, it performs a decrease-key operation.
   */
  insert(node) {
    if (this.nodePosition.has(node)) {
      // If node already exists, update its distance if the new distance is smaller.
      this.decreaseKey(node, node.distance);
      return;
    }
    const index = this.heap.length;
    this.heap.push(node);
    this.nodePosition.set(node, index);
    this.bubbleUp(index);
  }

  /**
   * Moves the node at the given index upward until the heap property is restored.
   * Uses a "hole" method to reduce the number of swaps.
   */
  bubbleUp(index) {
    const node = this.heap[index];
    while (index > 0) {
      const parentIndex = (index - 1) >> 1; // faster than Math.floor((index-1)/2)
      const parent = this.heap[parentIndex];
      if (node.distance < parent.distance) {
        // Move the parent down into the hole.
        this.heap[index] = parent;
        this.nodePosition.set(parent, index);
        index = parentIndex;
      } else {
        break;
      }
    }
    // Place the node into its final position.
    this.heap[index] = node;
    this.nodePosition.set(node, index);
  }

  /**
   * Moves the node at the given index downward until the heap property is restored.
   * Also uses the "hole" method.
   */
  bubbleDown(index) {
    const node = this.heap[index];
    const length = this.heap.length;
    while (true) {
      const left = (index << 1) + 1; // left child index
      const right = left + 1;        // right child index
      let smallest = index;

      // Instead of comparing the two children first, compare against node directly.
      if (left < length && this.heap[left].distance < node.distance) {
        smallest = left;
      }
      if (
        right < length &&
        this.heap[right].distance < this.heap[smallest].distance
      ) {
        smallest = right;
      }
      if (smallest !== index) {
        // Move the smaller child up into the hole.
        this.heap[index] = this.heap[smallest];
        this.nodePosition.set(this.heap[index], index);
        index = smallest;
      } else {
        break;
      }
    }
    // Place the node into its final position.
    this.heap[index] = node;
    this.nodePosition.set(node, index);
  }

  /**
   * Extracts and returns the node with the smallest distance.
   */
  extractMin() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    this.nodePosition.delete(min);
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.nodePosition.set(last, 0);
      this.bubbleDown(0);
    }
    return min;
  }

  /**
   * Performs a decrease-key operation on the given node.
   * Updates its distance and moves it upward if needed.
   */
  decreaseKey(node, newDistance) {
    const index = this.nodePosition.get(node);
    if (index === undefined) return;
    // Only update if the new distance is smaller.
    if (newDistance >= this.heap[index].distance) return;
    this.heap[index].distance = newDistance;
    this.bubbleUp(index);
  }

  /**
   * Helper method to swap two nodes in the heap and update their positions.
   * (Kept for compatibility; note that the bubble methods now use the hole method.)
   */
  swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
    this.nodePosition.set(this.heap[i], i);
    this.nodePosition.set(this.heap[j], j);
  }

  /**
   * Returns true if the node exists in the heap.
   */
  contains(node) {
    return this.nodePosition.has(node);
  }

  /**
   * Returns true if the heap is empty.
   */
  isEmpty() {
    return this.heap.length === 0;
  }
}
// Helpers to compute right and bottom from an object.
function getRight(obj) {
  return obj.left + obj.width;
}

function getBottom(obj) {
  return obj.top + obj.height;
}

// Quadtree that expects bounds & obstacles in {left, top, width, height} format.
// FastQuadtree is an accelerated quadtree that precomputes obstacle bounds and uses an iterative lookup.
class FastQuadtree {
  constructor(bounds, capacity = 8) {
    // bounds: { left, top, width, height }
    this.bounds = bounds;
    this.capacity = capacity;
    this.obstacles = [];
    this.divided = false;
  }
  
  subdivide() {
    const { left, top, width, height } = this.bounds;
    const halfW = width / 2;
    const halfH = height / 2;
    this.nw = new FastQuadtree({ left, top, width: halfW, height: halfH }, this.capacity);
    this.ne = new FastQuadtree({ left: left + halfW, top, width: halfW, height: halfH }, this.capacity);
    this.sw = new FastQuadtree({ left, top: top + halfH, width: halfW, height: halfH }, this.capacity);
    this.se = new FastQuadtree({ left: left + halfW, top: top + halfH, width: halfW, height: halfH }, this.capacity);
    this.divided = true;
  }
  
  insert(obstacle) {
    // Reject if the obstacle doesn't intersect this node.
    if (!this._intersects(obstacle, this.bounds)) {
      return false;
    }
    // Precompute right and bottom once to avoid recalculating later.
    if (obstacle._r === undefined) {
      obstacle._r = obstacle.left + obstacle.width;
      obstacle._b = obstacle.top + obstacle.height;
    }
    if (this.obstacles.length < this.capacity) {
      this.obstacles.push(obstacle);
      return true;
    }
    if (!this.divided) {
      this.subdivide();
    }
    return (
      this.nw.insert(obstacle) ||
      this.ne.insert(obstacle) ||
      this.sw.insert(obstacle) ||
      this.se.insert(obstacle)
    );
  }
  
  // Iterative lookup: returns true immediately when an obstacle containing the point is found.
  hasObstacleAt(point) {
    const stack = [this];
    while (stack.length) {
      const node = stack.pop();
      // Quick bounds test for the node.
      if (
        point.x < node.bounds.left ||
        point.x > node.bounds.left + node.bounds.width ||
        point.y < node.bounds.top ||
        point.y > node.bounds.top + node.bounds.height
      ) {
        continue;
      }
      // Check obstacles stored in this node.
      for (let i = 0, len = node.obstacles.length; i < len; i++) {
        const ob = node.obstacles[i];
        if (
          point.x >= ob.left &&
          point.x <= ob._r &&
          point.y >= ob.top &&
          point.y <= ob._b
        ) {
          return true;
        }
      }
      // Add children to the stack if subdivided.
      if (node.divided) {
        stack.push(node.nw, node.ne, node.sw, node.se);
      }
    }
    return false;
  }
  
  _intersects(ob, bounds) {
    // Check if obstacle (with left, top, width, height) and bounds intersect.
    const obRight = ob.left + ob.width;
    const obBottom = ob.top + ob.height;
    return !(
      ob.left > bounds.left + bounds.width ||
      obRight < bounds.left ||
      ob.top > bounds.top + bounds.height ||
      obBottom < bounds.top
    );
  }
}
function makePt(x, y) {
    return { x, y };
  }
  
  // Computes distance between two points
  function distance(a, b) {
    if (a.x === b.x) {
      // Vertical segment: difference in y-values
      return Math.abs(b.y - a.y) 
    }
    if (a.y === b.y) {
      // Horizontal segment: difference in x-values
      return Math.abs(b.x - a.x);
    }
    // Fallback in case points are not orthogonal (if needed)
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }
  
  class Rectangle {
    static get empty() {
      return new Rectangle(0, 0, 0, 0);
    }
  
    static fromRect(r) {
      return new Rectangle(r.left, r.top, r.width, r.height);
    }
  
    static fromLTRB(left, top, right, bottom) {
      return new Rectangle(left, top, right - left, bottom - top);
    }
  
    constructor(left, top, width, height) {
      this.left = left;
      this.top = top;
      this.width = width;
      this.height = height;
    }
  
    contains(p) {
      return p.x >= this.left && p.x <= this.right && p.y >= this.top && p.y <= this.bottom;
    }
  
    inflate(horizontal, vertical, snap) {
      if( snap !== undefined){
        return Rectangle.fromLTRB(
          Math.floor((this.left - horizontal) / snap) * snap,
          Math.floor((this.top - vertical) / snap) * snap,
          Math.ceil((this.right + horizontal) / snap) * snap,
          Math.ceil((this.bottom + vertical) / snap) * snap,
        );
      }
      return Rectangle.fromLTRB(
        this.left - horizontal,
        this.top - vertical,
        this.right + horizontal,
        this.bottom + vertical
      );
    }
  
    intersects(rectangle) {
      let thisX = this.left;
      let thisY = this.top;
      let thisW = this.width;
      let thisH = this.height;
      let rectX = rectangle.left;
      let rectY = rectangle.top;
      let rectW = rectangle.width;
      let rectH = rectangle.height;
      return (
        rectX < thisX + thisW &&
        thisX < rectX + rectW &&
        rectY < thisY + thisH &&
        thisY < rectY + rectH
      );
    }
  
    union(r) {
      const x = [this.left, this.right, r.left, r.right];
      const y = [this.top, this.bottom, r.top, r.bottom];
      return Rectangle.fromLTRB(
        Math.min(...x),
        Math.min(...y),
        Math.max(...x),
        Math.max(...y)
      );
    }
  
    get center() {
      return {
        x: this.left + this.width / 2,
        y: this.top + this.height / 2,
      };
    }
  
    get right() {
      return this.left + this.width;
    }
  
    get bottom() {
      return this.top + this.height;
    }
  
    get location() {
      return makePt(this.left, this.top);
    }
  
    get northEast() {
      return { x: this.right, y: this.top };
    }
  
    get southEast() {
      return { x: this.right, y: this.bottom };
    }
  
    get southWest() {
      return { x: this.left, y: this.bottom };
    }
  
    get northWest() {
      return { x: this.left, y: this.top };
    }
  
    get east() {
      return makePt(this.right, this.center.y);
    }
  
    get north() {
      return makePt(this.center.x, this.top);
    }
  
    get south() {
      return makePt(this.center.x, this.bottom);
    }
  
    get west() {
      return makePt(this.left, this.center.y);
    }
  
    get size() {
      return { width: this.width, height: this.height };
    }
  }
  
  class PointNode {
    constructor(data) {
      this.data = data;
      this.distance = Number.MAX_SAFE_INTEGER;
      this.visitedGeneration = 0;
      this.adjacentNodes = [];
    }
    addNeighbor(neighbor, weight) {
      this.adjacentNodes.push({ node: neighbor, weight: weight });
    }
  }
  
  class PointGraph {
    constructor() {
      //this.index = {};
      this.index = new Map();
      this.currentGeneration = 1;
    }
    _key(p) {
        // If a key is already computed on this point, return it.
      if (p._key !== undefined) {
        return p._key;
      }
      // Otherwise, compute it and cache it on the point.
      p._key = (p.x * 2) * 0x100000000 + (p.y * 2);
      //p._key = p.x +"-" + p.y
      return p._key;

      //return `${p.x},${p.y}`;
    }
    startNewSearch() {
      this.currentGeneration++;
    }

    resetNode(node) {
      node.distance = Number.MAX_SAFE_INTEGER;
      node.previousNode = null;
      node.settled = undefined
      node.visitedGeneration = this.currentGeneration;
    }

    add(p) {
      const key = this._key(p);
      if (!this.index.has(key)) {
        this.index.set(key, new PointNode(p));
      }
    }
  
    // Retrieve the node for a given point.
    get(p) {
      return this.index.get(this._key(p)) || null;
    }
  
    // Check if the graph contains a point.
    has(p) {
      return this.index.has(this._key(p));
    }
  
    getLowestDistanceNode(unsettledNodes) {
      let lowestDistanceNode = null;
      let lowestDistance = Number.MAX_SAFE_INTEGER;
      for (const node of unsettledNodes) {
        const nodeDistance = node.distance;
        if (nodeDistance < lowestDistance) {
          lowestDistance = nodeDistance;
          lowestDistanceNode = node;
        }
      }
      return lowestDistanceNode;
    }
  
    inferPathDirection(node) {
      if (!node.previousNode) {
        return null;
      }
      return this.directionOfNodes(node.previousNode, node);
    }
  
      calculateShortestPathFromSource(graph, source, destinationNodes, lastPath, startHorz, endHorz) {
        this.resetNode(source);
        source.distance = 0;
        const minHeap = new MinHeap();
        minHeap.insert(source);
      
        while (!minHeap.isEmpty()) {
          const currentNode = minHeap.extractMin();
          let found = destinationNodes.find(d=>d===currentNode)
          if (found) {
              return found;
          }
          
          currentNode.settled = true
      
          for (let i = 0, len = currentNode.adjacentNodes.length; i < len; i++) {
            const { node: adjacentNode, weight: edgeWeight } = currentNode.adjacentNodes[i];

            if (adjacentNode.visitedGeneration !== this.currentGeneration) {
              this.resetNode(adjacentNode);
            }
            if (!adjacentNode.settled) {
              let alignEnd
              let found = destinationNodes.find(d=>d===adjacentNode)
              if(found ){
                alignEnd =  (endHorz ? "v" : "h");
              }
             if( this.calculateMinimumDistance(adjacentNode, edgeWeight, currentNode, lastPath, startHorz, alignEnd)){
               minHeap.insert(adjacentNode);
              }
            }
          }
        }
     
        return undefined;
      }
  
      distanceFromPointToSegment(p, v, w) {
        const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projection = {
          x: v.x + t * (w.x - v.x),
          y: v.y + t * (w.y - v.y)
        };
        return Math.hypot(p.x - projection.x, p.y - projection.y);
      }
      
      computeDeviationCost(node, previousPath, penaltyFactor = 1) {
        if (!previousPath || previousPath.length === 0) return 0;
        let minDist = Infinity;
        const p = node.data;
        // Check each segment of the previous path.
        const previousLength = previousPath.length
        for (let i = 0; i < previousLength - 1; i++) {
          const v = previousPath[i];
          const w = previousPath[i + 1];
          const d = this.distanceFromPointToSegment(p, v, w) * (previousLength - i)
          if (d < minDist) {
            minDist = d 
          }
        }
        return penaltyFactor * minDist;
      }

    calculateMinimumDistance(evaluationNode, edgeWeigh, sourceNode, previousPath, startHorz, endHorz) {
      const sourceDistance = sourceNode.distance;
      const comingDirection = this.inferPathDirection(sourceNode) ?? (startHorz ? "v" : "h");
      const goingDirection = this.directionOfNodes(sourceNode, evaluationNode);
      const changingDirection = comingDirection && goingDirection && comingDirection !== goingDirection;
      const multiplier = evaluationNode.data.mid === 0 ? 1 : 0.2

      const endAligned = endHorz === undefined ? 0 : (endHorz == goingDirection ? 0 : (Math.pow(edgeWeigh, 4))) 

      const extraWeigh = changingDirection ? (Math.pow(edgeWeigh, 0.2)) * (sourceNode.changedDirection ?? 0) : 0
  
      const deviationCost = previousPath ? this.computeDeviationCost(evaluationNode, previousPath, 1) : 0

      const totalCost = sourceDistance + (multiplier * (edgeWeigh + extraWeigh + endAligned + deviationCost));

      if (totalCost < evaluationNode.distance) {
        evaluationNode.distance = totalCost;
        evaluationNode.previousNode = sourceNode
        evaluationNode.changedDirection = changingDirection ? 1 : (sourceNode.changedDirection ?? 0) * 0.9

        return true;
      }
      return false;
    }
    reconstructPath(destinationNode) {
      const path = [];
      let current = destinationNode;
      while (current != null) {
        path.unshift(current);  // Add to the beginning of the path.
        current = current.previousNode;
      }
      return path;
    }
  
    directionOf(a, b) {
      if (a.x === b.x) {
        return 'h';
      } else if (a.y === b.y) {
        return 'v';
      } else {
        return null;
      }
    }
  
    directionOfNodes(a, b) {
      return this.directionOf(a.data, b.data);
    }
    connectBoth(a, b) {
      const nodeA = this.get(a);
      const nodeB = this.get(b);
      if (!nodeA || !nodeB) {
        throw new Error(`A point was not found`);
      }
      const w = distance(a, b);
      //nodeA.adjacentNodes.set(nodeB, w);
      //nodeB.adjacentNodes.set(nodeA, w);
      nodeA.addNeighbor(nodeB, w);
      nodeB.addNeighbor(nodeA, w);
    }
  }
  
  // Gets the actual point of the connector based on the distance parameter
  
  
  // Returns flag indicating if the side belongs on a vertical axis
  function isVerticalSide(side) {
    return side === "top" || side === "bottom";
  }
  
  function rulersToSpotsFull(verticals, horizontals,  obstacles = [], midThresh) {
    const spots = [];
    const seen = new Set();
    const obsLen = obstacles.length;
  
    function addPoint(p) {
        for (const ob of obstacles) {
          if (p.x >= ob.left && p.x <= ob.right && p.y >= ob.top && p.y <= ob.bottom) {
            return;
          }
        }
        spots.push(p);
    }
  
    // 1. Add intersections (vertical x, horizontal y)
    for (const x of verticals) {
      for (const y of horizontals) {
        addPoint({ x, y });
      }
    }
  
    // 2. Add horizontal edge midpoints: For each horizontal line, midpoint between adjacent verticals.
    for (const y of horizontals) {
      for (let i = 0; i < verticals.length - 1; i++) {
        if( (verticals[i + 1] - verticals[i]) > midThresh){
            const xMid = (verticals[i] + verticals[i + 1]) / 2;
            addPoint({ x: xMid, y, mid: 1 });
        }
      }
    }
  
    // 3. Add vertical edge midpoints: For each vertical line, midpoint between adjacent horizontals.
    for (const x of verticals) {
      for (let j = 0; j < horizontals.length - 1; j++) {
        if( (horizontals[j + 1] - horizontals[j]) > midThresh){
          const yMid = (horizontals[j] + horizontals[j + 1]) / 2;
          addPoint({ x, y: yMid, mid: 2 });
        }
      }
    }
  
    // 4. Add cell centers: For each cell defined by adjacent verticals and horizontals.
    for (let i = 0; i < verticals.length - 1; i++) {
      for (let j = 0; j < horizontals.length - 1; j++) {
        if( ((verticals[i + 1] - verticals[i]) > midThresh) && ((horizontals[j + 1] - horizontals[j]) > midThresh)){
          const xMid = (verticals[i] + verticals[i + 1]) / 2;
          const yMid = (horizontals[j] + horizontals[j + 1]) / 2;
          addPoint({ x: xMid, y: yMid, mid: 4 });
        }
      }
    }
    return spots;
  }

  
  // Creates a graph connecting the specified points orthogonally
  function createGraph(spots) {
    const hotXs = [];
    const hotYs = [];
    const graph = new PointGraph();
    const connections = [];
  

    const seenX = new Set()
    const seenY = new Set()

    spots.forEach(p => {
      const { x, y } = p;
      if( !seenX.has(x) ){
        seenX.add(x)
        hotXs.push(x)
      }
      if( !seenY.has(y) ){
        seenY.add(y)
        hotYs.push(y)
      }
      graph.add(p);
    });
  
    hotXs.sort((a, b) => a - b);
    hotYs.sort((a, b) => a - b);
  
    const inHotIndex = (p) => graph.has(p);
  
    for (let i = 0; i < hotYs.length; i++) {
      for (let j = 0; j < hotXs.length; j++) {
        const b = makePt(hotXs[j], hotYs[i]);
  
        if (!inHotIndex(b)) continue;
  
        if (j > 0) {
          const a = makePt(hotXs[j - 1], hotYs[i]);
          if (inHotIndex(a)) {
            graph.connectBoth(a, b);
            //connections.push([a,b])
          }
        }
  
        if (i > 0) {
          const a = makePt(hotXs[j], hotYs[i - 1]);
          if (inHotIndex(a)) {
            graph.connectBoth(a, b);
          //  connections.push([a,b])
          }
        }
      }
    }
  
    return { graph, connections };
  }
  function findDirectPath( origin, destination, margin){
    const [start, end] = [origin, destination].sort((a, b) => a.data.x - b.data.x);
    const xsA = {}
    const xsB = {}
    const overlapX = []
    for (let node = start; node; ) {
      xsA[node.data.x] = node;
      if (node === end) break;
      const next = node.adjacentNodes.find(adj => adj.node.data.y === node.data.y && adj.node.data.x > node.data.x
      );
      node = next ? next.node : null;
    }
  
    // Traverse from end to start horizontally
    for (let node = end; node; ) {
      xsB[node.data.x] = node;
      if (xsA[node.data.x]) overlapX.push(node.data.x);
      if (node === start) break;
      const prev = node.adjacentNodes.find(adj => adj.node.data.y === node.data.y && adj.node.data.x < node.data.x
      );
      node = prev ? prev.node : null;
    }
    if( overlapX.length === 0){
      if( (end.data.x - start.data.x) < (2 * margin)){
        const mid = (start.data.x + end.data.x) / 2
        if( start === origin){
          return {path: [{x: mid, y: start.data.y}, {x:mid, y: end.data.y}], node:end, distance: 0, mode: 3}
        }else{
          return {path: [{x: mid, y: end.data.y}, {x:mid, y: start.data.y}], node:start, distance: 0, mode: 3}
        }
      }
      return
    }
    const midPoint = (end.data.x + start.data.x) / 2
    const overlapOrder = overlapX.sort((a,b)=>Math.abs(a - midPoint) - Math.abs(b - midPoint))
    //console.log(`Overlap order = ${overlapOrder.join(",")}`)
    
    for(const x of overlapOrder){
      const nodeA = xsA[x], nodeB = xsB[x]
      const yLimits = [nodeA, nodeB].sort((a,b)=>a.data.y - b.data.y)
      let found = true
      for(let thisNode = yLimits[0]; thisNode !== yLimits[1]; ){
        const nextNode = thisNode.adjacentNodes.find(d2=>d2.node.data.x === thisNode.data.x && d2.node.data.y > thisNode.data.y)
        if( !nextNode){
          found = false
          break
        }
        thisNode = nextNode.node
      }
      if( found ){
        //console.log(`Got route`)
        let nodePath 
        if( start === origin){
           nodePath = [start.data, nodeA.data, nodeB.data, end.data].filter((d,i,a)=>i == 0 || d !== a[i-1])
           return {path: nodePath, node: end, distance: 0, mode: 2}
        }else{
           nodePath = [end.data, nodeB.data, nodeA.data, start.data].filter((d,i,a)=>i == 0 || d !== a[i-1])
           return {path: nodePath, node: start, distance: 0, mode: 2}
        }
        break
      }
    }
    
  }
  
  // Solves the shortest path for the origin-destination path of the graph
  function shortestPath(graph, origin, destinationPoints, lastPath, startHorz, endHorz, margin) {
    const originNode = graph.get(origin);
    const destinationNodes = destinationPoints.map((d,i)=>{
      const pt = graph.get(d)

      if (!pt) {
        console.error(`Destination nodes not found ${d.x}, ${d.y} - idx ${i}`);
      }
      return pt
    })
  
    if (!originNode) {
      console.error(`Origin node {${origin.x},${origin.y}} not found`);
      return
    }
    const directPath = findDirectPath( originNode, destinationNodes[0], margin)
    if( directPath ){
      return directPath
    }
  
  
    const matchNode = graph.calculateShortestPathFromSource(graph, originNode, destinationNodes, lastPath, startHorz, endHorz);
  
    const shortestPath = graph.reconstructPath(matchNode)
    return {path: shortestPath.map(n => n.data), node: matchNode, distance: matchNode?.distance ?? Infinity}
  }
  
  // Given three points representing two connected segments,
  // determines if the second segment bends in an orthogonal direction.
  // Returns 'none' if straight, a cardinal direction ('n', 'e', 's', 'w') if it bends, or 'unknown'.
  function getBend(a, b, c) {
    const equalX = a.x === b.x && b.x === c.x;
    const equalY = a.y === b.y && b.y === c.y;
    const segment1Horizontal = a.y === b.y;
    const segment1Vertical = a.x === b.x;
    const segment2Horizontal = b.y === c.y;
    const segment2Vertical = b.x === c.x;
  
    if (equalX || equalY) {
      return 'none';
    }
  
    if (
      !(segment1Vertical || segment1Horizontal) ||
      !(segment2Vertical || segment2Horizontal)
    ) {
      return 'unknown';
    }
  
    if (segment1Horizontal && segment2Vertical) {
      return c.y > b.y ? 's' : 'n';
    } else if (segment1Vertical && segment2Horizontal) {
      return c.x > b.x ? 'e' : 'w';
    }
  
    throw new Error('Nope');
  }

  function removeStaircase(points, canAdd) {
    // Work on a copy so the original array is not modified.
    let result = points.slice();
    let changed = true;
  
    while (changed) {
      changed = false;
  
      // Look for staircase patterns with four consecutive points.
      for (let i = 1; i <= result.length - 5; i++) {
        const A = result[i];
        const B = result[i + 1];
        const C = result[i + 2];
        const D = result[i + 3];
  
        // Determine orientations of the segments.
        const ABVertical   = (A.x === B.x) && (A.y !== B.y);
        const ABHorizontal = (A.y === B.y) && (A.x !== B.x);
        const BCVertical   = (B.x === C.x) && (B.y !== C.y);
        const BCHorizontal = (B.y === C.y) && (B.x !== C.x);
        const CDVertical   = (C.x === D.x) && (C.y !== D.y);
        const CDHorizontal = (C.y === D.y) && (C.x !== D.x);
  
        // Detect staircase: Two bends (B and C) that may be unnecessary.
        if (
          (ABVertical && CDVertical && BCHorizontal) ||
          (ABHorizontal && CDHorizontal && BCVertical)
        ) {
          // Compute the candidate bend point.
          let candidate;
          if (ABVertical) {
            // If A->B is vertical, candidate is at (A.x, D.y)
            candidate = { x: A.x, y: D.y };
          } else {
            // If A->B is horizontal, candidate is at (D.x, A.y)
            candidate = { x: D.x, y: A.y };
          }
  
          // Check for collision at the candidate position.
          if (canAdd(candidate, A)){
              // Replace B and C with the candidate.
              result.splice(i + 1, 2, candidate);
              changed = true;
              // Break out of the loop to restart scanning from the beginning.
              break;
          }
        }
      }
  
      // After attempting a staircase removal, merge any collinear points.
      const merged = simplifyPath(result);
      if (merged.length !== result.length) {
        result = merged;
        changed = true;
      }
    }
  
    return result;
  }


  function removeFullTurns(points, canAdd) {
    if (points.length < 5) return points;
    let simplified = points.slice();
    let modified = true;
    while (modified) {
      modified = false;
      for (let i = 0; i <= simplified.length - 5; i++) {
        const A = simplified[i];
        const B = simplified[i + 1];
        const C = simplified[i + 2];
        const D = simplified[i + 3];
        const E = simplified[i + 4];
  
        // --- Horizontal–initial full turn pattern ---
        if (
          (A.y === B.y && A.x !== B.x) &&          // A→B horizontal
          (B.x === C.x && B.y !== C.y) &&          // B→C vertical
          (C.y === D.y && C.x !== D.x) &&          // C→D horizontal
          (D.x === E.x && D.y !== E.y)             // D→E vertical
        ) {
          // Check that the horizontal segments are oppositely directed.
          const horizontalDir1 = (B.x > A.x) ? 'right' : 'left';
          const horizontalDir2 = (D.x > C.x) ? 'right' : 'left';
          if ((horizontalDir1 === 'right' && horizontalDir2 === 'left') ||
              (horizontalDir1 === 'left' && horizontalDir2 === 'right')) {
            // And that the vertical segments share the same direction.
            const verticalDir1 = (C.y > B.y) ? 'down' : 'up';
            const verticalDir2 = (E.y > D.y) ? 'down' : 'up';
            if (verticalDir1 === verticalDir2) {
              // Compute two candidate replacements.
              const candidate1 = { x: E.x, y: A.y };
              const candidate2 = { x: A.x, y: E.y };
              if (canAdd(candidate1, E)) {
                simplified.splice(i + 1, 3, candidate1);
                modified = true;
                break;
              } /*else if (canAdd(candidate2, E)) {
                simplified.splice(i + 1, 3, candidate2);
                modified = true;
                break;
              }*/
            }
          }
        }
        // --- Vertical–initial full turn pattern ---
        /*else if (
          (A.x === B.x && A.y !== B.y) &&          // A→B vertical
          (B.y === C.y && B.x !== C.x) &&          // B→C horizontal
          (C.x === D.x && C.y !== D.y) &&          // C→D vertical
          (D.y === E.y && D.x !== E.x)             // D→E horizontal
        ) {
          // Check that the vertical segments are oppositely directed.
          const verticalDir1 = (B.y > A.y) ? 'down' : 'up';
          const verticalDir2 = (D.y > C.y) ? 'down' : 'up';
          if ((verticalDir1 === 'down' && verticalDir2 === 'up') ||
              (verticalDir1 === 'up' && verticalDir2 === 'down')) {
            // And that the horizontal segments share the same direction.
            const horizontalDir1 = (C.x > B.x) ? 'right' : 'left';
            const horizontalDir2 = (E.x > D.x) ? 'right' : 'left';
            if (horizontalDir1 === horizontalDir2) {
              // Compute two candidate replacements.
              const candidate1 = { x: A.x, y: E.y };
              const candidate2 = { x: E.x, y: A.y };
              if (canAdd(candidate1, E)) {
                simplified.splice(i + 1, 3, candidate1);
                modified = true;
                break;
              } else if (canAdd(candidate2, E)) {
                simplified.splice(i + 1, 3, candidate2);
                modified = true;
                break;
              }
            }
          }
        }*/
      }
      // Merge any collinear points that might have resulted.
      const merged = simplifyPath(simplified);
      if (merged.length !== simplified.length) {
        simplified = merged;
        modified = true;
      }
    }
    return simplified;
  }

  function simplifyConnector(points, canAdd) {
    let result = points.slice();
    let changed = true;
    while (changed) {
      changed = false;
      const afterStaircase = removeStaircase(result, canAdd);
      if (afterStaircase.length !== result.length) {
        result = afterStaircase;
        changed = true;
        continue;
      }
      const afterFullTurn = removeFullTurns(result, canAdd);
      if (afterFullTurn.length !== result.length) {
        result = afterFullTurn;
        changed = true;
        continue;
      }
      const merged = simplifyPath(result);
      if (merged.length !== result.length) {
        result = merged;
        changed = true;
      }
    }
    return result;
  }
  
  
  // Simplifies the path by removing unnecessary points based on orthogonal pathways
  function simplifyPath(points) {
    points = points.filter(d=>d)
    if (points.length <= 2) {
      return points;
    }
  
    const r = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const cur = points[i];
  
      if (i === points.length - 1) {
        r.push(cur);
        break;
      }
  
      const prev = points[i - 1];
      const next = points[i + 1];
      const bend = getBend(prev, cur, next);
  
      if (bend !== 'none') {
        r.push(cur);
      }
    }
    return r;
  }
  
  class Grid {
    constructor() {
      this._rows = 0;
      this._cols = 0;
      this.data = new Map();
    }
  
    set(row, column, rectangle) {
      this._rows = Math.max(this.rows, row + 1);
      this._cols = Math.max(this.columns, column + 1);
  
      let rowMap = this.data.get(row);
      if (!rowMap) {
        rowMap = new Map();
        this.data.set(row, rowMap);
      }
  
      rowMap.set(column, rectangle);
    }
  
    get(row, column) {
      const rowMap = this.data.get(row);
      if (rowMap) {
        return rowMap.get(column) || null;
      }
      return null;
    }
  
    rectangles() {
      const r = [];
      for (const [_, data] of this.data) {
        for (const [__, rect] of data) {
          r.push(rect);
        }
      }
      return r;
    }
  
    get columns() {
      return this._cols;
    }
  
    get rows() {
      return this._rows;
    }
  }
  
  export class OrthogonalConnector {

// Utility Point creator
    constructor(options){
      this.shapes = options.shapes.reduce((a,c)=>{a[c.id] = c; return a}, {})
      this.globalBoundsMargin = options.globalBoundsMargin
      this.shapeMargin = options.shapeMargin;
      this.bigBounds = Rectangle.fromRect(options.globalBounds);
      this.pathCache = new Map();
      this.scale = options.scale ? (options.scale  / 2) : 1

        this.debug = options.debug


      this.inflatedRects = {}

      this.inflateShapes()
      this.setupBase()
    }
    shapes(){
      return this.shapes
    }
    setupBase(){
      const sz = (this.shapeMargin * 2) / this.scale
      this.verticals = new Set();
      this.horizontals = new Set();
      for (const b of Object.values(this.inflatedRects)) {

        this.verticals.add(Math.floor(b.left / sz) * sz);
        this.verticals.add(Math.ceil(b.right / sz) * sz);
        this.horizontals.add(Math.floor(b.top / sz) * sz);
        this.horizontals.add(Math.ceil(b.bottom / sz) * sz);

      }

    }
    inflateShape(shape){
      let shapeMargin = this.shapeMargin / (this.scale * 2 )
      return Rectangle.fromRect(shape).inflate(shapeMargin, shapeMargin)
    }
    inflateShapes(){
      this.inflatedRects = Object.values(this.shapes).reduce((a,d) => {a[d.id] = this.inflateShape(d); return a}, {})
    }
    



    static byproduct = {
      hRulers: [],
      vRulers: [],
      spots: [],
      grid: [],
      connections: [],
    };


    static doesSegmentIntersectRectangle(p1, p2, rect) {
      if (rect.contains(p1) || rect.contains(p2)) {
        return true;
      }
    
      // Check for a horizontal segment.
      if (p1.y === p2.y) {
        // The segment is horizontal; its y must be between the top and bottom of rect.
        if (p1.y >= rect.top && p1.y <= rect.bottom) {
          // Determine the horizontal span of the segment.
          const segLeft = Math.min(p1.x, p2.x);
          const segRight = Math.max(p1.x, p2.x);
          // Check if there is any overlap with the rectangle's x-range.
          if (segRight >= rect.left && segLeft <= rect.right) {
            return true;
          }
        }
      }
      // Check for a vertical segment.
      else if (p1.x === p2.x) {
        if (p1.x >= rect.left && p1.x <= rect.right) {
          const segTop = Math.min(p1.y, p2.y);
          const segBottom = Math.max(p1.y, p2.y);
          if (segBottom >= rect.top && segTop <= rect.bottom) {
            return true;
          }
        }
      }
      // For non-orthogonal segments, this simplified function doesn't handle the check.
      return false;
    }
    
    static doesPathCutThroughRectangle(rect, path) {
      for (let i = 0; i < path.length - 1; i++) {
        if (OrthogonalConnector.doesSegmentIntersectRectangle(path[i], path[i + 1], rect)) {
          return true;
        }
      }
      return false;
    }
    removeShape(shape){
      this.internalRemoveShape( shape )
      this.setupBase()
    }
    internalRemoveShape(shape){
      const existing = this.shapes[shape.id]

      if( existing ){
        this.links = this.links.filter(d=>{
          if( d.pointA.shape === existing || d.pointB.shape === existing){
            const key = OrthogonalConnector.getConnectionKey(d);
            console.log(`REMOVE LINK ${key}`)            
            this.pathCache.delete(key)
            return false
          }
          return true
        })
        
        delete this.shapes[shape.id]
        delete this.inflatedRects[shape.id]
      }
    }
    addShape(shape){
      this.internalRemoveShape( shape )
      this.shapes[shape.id] = shape
      this.inflatedRects[shape.id] = this.inflateShape(shape)
      this.setupBase()
    }

    moveShape(shapeId, position){
      const shape = this.shapes[shapeId]

      if( this.pathCache ){
        for(const [idx, entry] of this.pathCache){
          if( entry.shapeA.id === shapeId || entry.shapeB.id === shapeId  || OrthogonalConnector.doesPathCutThroughRectangle(Rectangle.fromRect(shape), entry.path)){
            entry.redo = true
          }
        }
      }
      if( position.left !== undefined){
        shape.left = position.left
      }
      if( position.top !== undefined){
        shape.top = position.top
      }
      if( position.width !== undefined ){
        shape.width = position.width
      }
      if( position.height !== undefined ){
        shape.height = position.height
      }
      this.inflatedRects[shape.id] = this.inflateShape(shape)
      this.setupBase()
    }
    
  

    static getConnectionKey({ id, pointA, pointB }) {
      return id ?? `${pointA.shape.id}-::${pointB.shape.id}-`;
    }
    paths(){
      if( this.pathCache ){
        return [...this.pathCache.entries()].map(d=>d[1].path)
      }
      return []
    }
  

    static route(links, target) {
      if(target.rescale ){
        target.scale = (target.rescale.a / 2)
        console.log(`RESCALED ROUTE = ${target.scale}`)
        target.inflateShapes()
        target.setupBase()
      }
      this.routing = true
      const interimSpots = [];
      if( links ){
        target.links = links
      }else{
        links = target.links
      }
      
      let shapeMargin = target.shapeMargin / (target.scale * 2 )
      
      //const inflatedRects = Object.values(target.inflatedRects)
      const rects = Object.values(target.shapes).map(d=>Rectangle.fromRect(d))
  
      // Curated bounds to stick to
      // Add edges to rulers
      let verticals = [...target.verticals]
      let horizontals = [...target.horizontals]

      const vs = new Set(verticals)
      const hs = new Set(horizontals)

      //const keepPoints = []
      const shapesWithConnectors = []
      const shapeTracker = new Set()
      const termPoints = {}
      function makePt(x, y) {
        x = target.scale === 1 ? x : (Math.floor(x * target.scale) / target.scale)
        y = target.scale === 1 ? y : (Math.floor(y * target.scale) / target.scale)
        return { x, y };
      }
      function computePt(p, side) {
        const b = Rectangle.fromRect(p.shape);
        switch (side ?? p.side) {
          case "bottom":
            return makePt(b.left + b.width * p.distance, b.bottom);
          case "top":
            return makePt(b.left + b.width * p.distance, b.top);
          case "left":
            return makePt(b.left, b.top + b.height * p.distance);
          case "right":
            return makePt(b.right, b.top + b.height * p.distance);
        }
      }
      
      for(const opts of links){
        const { id, pointA, pointB } = opts;
        const key = this.getConnectionKey(opts)
        const shapeA = Rectangle.fromRect(target.shapes[pointA.shape.id])
        const shapeB = Rectangle.fromRect(target.shapes[pointB.shape.id])

        const innerMargin = 0//(target.shapeMargin - 1) / (target.scale * 2 )
        let inflatedA = shapeA.inflate(innerMargin, innerMargin);
        let inflatedB = shapeB.inflate(innerMargin, innerMargin);
    
        // Check bounding boxes collision
        if (inflatedA.intersects(inflatedB)) {
          shapeMargin = 0;
          inflatedA = shapeA;
          inflatedB = shapeB;
        }
        if( !shapeTracker.has( pointA.shape) ){
          shapeTracker.add( pointA.shape)
          shapesWithConnectors.push(inflatedA)
        }
        if( !shapeTracker.has( pointB.shape) ){
          shapeTracker.add( pointB.shape)
          shapesWithConnectors.push(inflatedB)
        }


        termPoints[key] = {a:[], b:[], oa:[], ob:[]}

        function addVertical(d, ceil){
          if( !vs.has(d)){
            vs.add(d)
            verticals.push(d)
          }
        }
        function addHorizontal(d, ceil){
          if( !hs.has(d)){
            hs.add(d)
            horizontals.push(d)
          }
        }
    
        let termination = "a"
        for(const point of [pointA, pointB]){
          for(const side of [point.side].flat()){
            const p = computePt({...point, shape: target.shapes[point.shape.id]}, side);

            if (isVerticalSide(side)) {
              addVertical(p.x);
            } else {
              addHorizontal(p.y);
            }
            termPoints[key]["o" + termination].push(p)

            const add = (x,y) => {
              const pt = {x,y}
              interimSpots.push(pt)
              termPoints[key][termination].push(pt)
            };
          
    
            switch (side) {
              case "top":
                const rt = Math.floor((p.y - shapeMargin) * target.scale) / target.scale
                add(p.x, rt);
                addHorizontal(rt);
                break;
              case "right":
                const rr = Math.ceil((p.x + shapeMargin) * target.scale) / target.scale
                add(rr, p.y);
                addVertical(rr, true);
                break;
              case "bottom":
                const rb = Math.ceil((p.y + shapeMargin) * target.scale) / target.scale
                add(p.x, rb);
                addHorizontal(rb, true);
                break;
              case "left":
                const rl = Math.floor((p.x - shapeMargin) * target.scale) / target.scale
                addVertical(rl);
                add(rl, p.y);
                break;
            }
          }
          termination = "b"
        }
      }
  
      // Sort rulers
      verticals.sort((a, b) => a - b)
      horizontals.sort((a, b) => a - b)
  
      const blocksToClear = []//inflatedRects
  
      const spots = rulersToSpotsFull(verticals, horizontals,  [...blocksToClear, ...shapesWithConnectors], 5 / target.scale);
      
      this.byproduct.spots = spots;
      this.byproduct.vRulers = verticals;
      this.byproduct.hRulers = horizontals;
      target.byproduct = this.byproduct


      
      // Add to spots
      spots.push(...interimSpots);
      const { graph, connections } = createGraph(spots);
      this.byproduct.connections = connections;
      
      console.log(`Spots = ${spots.length} verticals = ${verticals.length}`)
      const paths = []
      for(const link of links){
        const key = this.getConnectionKey(link);
        const shapeA = Rectangle.fromRect(target.shapes[link.pointA.shape.id])
        const shapeB = Rectangle.fromRect(target.shapes[link.pointB.shape.id])

          const usablePoints = termPoints[key].ob.filter(d=>!shapeA.contains(d))
          if( usablePoints.length === 0){
            console.log(`SKIPPING`)
            paths.push({id: key, updated: true,path: [], mode: 4});
            continue
          }

        let cached
        if (target.pathCache.has(key)) {
          cached = target.pathCache.get(key);
          if ( !target.rescale && !cached.redo){
            continue;
          }
        }

        const { pointA, pointB } = link;
        let bestPath = []
        let bestScore = Infinity
        let bestStart, bestOrigin, bestEnd
        let sideIdx = 0
        let bestMode = 0
        const aSide = [pointA.side].flat()
        for( const side of aSide){
          const origin = termPoints[key].a[sideIdx]//extrudeCp(pointA, shapeMargin);
          const start = termPoints[key].oa[sideIdx]//extrudeCp(pointA, shapeMargin);

          
          graph.startNewSearch()
          const {path, node, distance, mode} = shortestPath(graph, origin, termPoints[key].b, cached?.path, side === "left" || side === "right", true, shapeMargin) 
          if( distance < bestScore ){
            bestPath = path ?? []
            bestEnd = node
            bestScore = distance
            bestStart = start
            bestOrigin = origin
            bestMode = mode
          }
          sideIdx++        
        }
        let fullPath, pathForCache
        if( bestEnd){
          let pos = termPoints[key].b.findIndex( d=>d.x === bestEnd.data.x && d.y === bestEnd.data.y)
          let end = termPoints[key].ob[pos]
          let bSide = [pointB.side].flat()[pos]
          if( bestMode === 2 && !end){
            if(aSide === "right" && (bestPath[0].x > bestPath[1].x) || aSide === "left" && (bestPath[0].x < bestPath[1].x)){
              bestPath.shift()
            }
            bestPath.pop()
            let pos = termPoints[key].b.map( (d,i)=>[i,Math.hypot(d.x - bestEnd.data.x, d.y - bestEnd.data.y)]).sort((a,b)=>a[1]< b[1])[0][0]
            end = termPoints[key].ob[pos]
            fullPath = simplifyPath([bestStart, ...bestPath, end]);
          }else if( bestMode === 3){
            let thisPath
            let finalStart = bestStart
            let finalEnd = bestEnd.data
            if( aSide == "right"){
              if( bestPath[0].x < bestStart.x ){
                finalStart = bestOrigin
              }
            }else{
              if( bestPath[0].x > bestStart.x ){
                finalStart = bestOrigin
              }
            }
            if( bSide == "left"){
              if( bestPath[bestPath.length - 1].x > bestEnd.data.x ){
                finalEnd = end
              }
            }else{
            }
            fullPath = simplifyPath([finalStart, ...bestPath, finalEnd]);
          }else{
            fullPath = simplifyPath([bestStart, ...bestPath, end]);
            if( !bestMode){
              pathForCache = fullPath
              fullPath = simplifyConnector(fullPath, (p, prev)=>{
                  if( graph.has(p)){
                    return !rects.some(d=>OrthogonalConnector.doesSegmentIntersectRectangle(prev, p, d))
                  }
                  return false
                })
              //paths.push({id: key + "-org", updated: true,path: cleanPath.map(d=>[d.x,d.y]), mode: 5});
            }
          }
        }else{
          fullPath = [termPoints[key].a[0], termPoints[key].b[0]]
        }
        
        target.pathCache.set(key, {
          key,
          redo: false,
          path: pathForCache ?? fullPath,
          shapeA: pointA.shape,
          shapeB: pointB.shape,
        });
        
        const externalPath = fullPath.map(d=>[d.x,d.y])
        
        paths.push({id: key, updated: true,path: externalPath, mode: bestMode});
      }
      delete target["rescale"]
      return paths
    }
  }


  self.onmessage = (e) => {
    const data = e.data;
    let result = ""

    if(data.type === "create"){
      classTracker[data.idx] = new OrthogonalConnector(data.options)
    }else if(data.type === "destroy"){
      delete classTracker[data.idx]
    }else if(data.type === "move"){
      classTracker[data.idx].moveShape(data.id, data.position)
    }else if(data.type === "remove"){
      classTracker[data.idx].removeShape(data.data)
    }else if(data.type === "add"){
      classTracker[data.idx].addShape(data.data)
    }else if(data.type === "setScale"){
      console.log(`RESCALED request = ${data.a}`)
      classTracker[data.idx].rescale = {a: data.a, b: data.b}
    }else if(data.type === "route"){
      console.time("route")
      const paths = OrthogonalConnector.route(data.options.links, classTracker[data.idx])
      console.timeEnd("route")
      result = {
        type: "paths",
        idx: data.idx,
        paths
      }
      if( classTracker[data.idx].debug ){
        self.postMessage({
          type: "data",
          idx: data.idx,
          byproduct: classTracker[data.idx].byproduct,
          shapes: Object.values(classTracker[data.idx].shapes ?? {})
        });
      }
    }

    self.postMessage(result);
  };