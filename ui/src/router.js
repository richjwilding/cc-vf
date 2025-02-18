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
      return Math.abs(b.y - a.y) * 1.5;
    }
    if (a.y === b.y) {
      // Horizontal segment: difference in x-values
      return Math.abs(b.x - a.x);
    }
    // Fallback in case points are not orthogonal (if needed)
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * 10;
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
  
    inflate(horizontal, vertical) {
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
  
      calculateShortestPathFromSource(graph, source, destinationNodes, lastPath) {
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
      
          //for (const [adjacentNode, edgeWeight] of currentNode.adjacentNodes) {
          for (let i = 0, len = currentNode.adjacentNodes.length; i < len; i++) {
            const { node: adjacentNode, weight: edgeWeight } = currentNode.adjacentNodes[i];

            if (adjacentNode.visitedGeneration !== this.currentGeneration) {
              this.resetNode(adjacentNode);
            }
            if (!adjacentNode.settled) {
             if( this.calculateMinimumDistance(adjacentNode, edgeWeight, currentNode, lastPath)){
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
        for (let i = 0; i < previousPath.length - 1; i++) {
          const v = previousPath[i];
          const w = previousPath[i + 1];
          const d = this.distanceFromPointToSegment(p, v, w);
          if (d < minDist) {
            minDist = d;
          }
        }
        return penaltyFactor * minDist;
      }

    calculateMinimumDistance(evaluationNode, edgeWeigh, sourceNode, previousPath) {
      const sourceDistance = sourceNode.distance;
      const comingDirection = this.inferPathDirection(sourceNode);
      const goingDirection = this.directionOfNodes(sourceNode, evaluationNode);
      const changingDirection = comingDirection && goingDirection && comingDirection !== goingDirection;
      const extraWeigh = changingDirection ? Math.pow(edgeWeigh + 1, 2) + (sourceDistance / 2) : 0;
  
      const deviationCost = previousPath ? this.computeDeviationCost(evaluationNode, previousPath, 20) : 0

      const totalCost = sourceDistance + edgeWeigh + extraWeigh + deviationCost;

      if (totalCost < evaluationNode.distance) {
        evaluationNode.distance = totalCost;
        evaluationNode.previousNode = sourceNode
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
  
  
  // Returns flag indicating if the side belongs on a vertical axis
  function isVerticalSide(side) {
    return side === "top" || side === "bottom";
  }
  
  function rulersToSpotsFull(verticals, horizontals, qt, obstacles = []) {
    const spots = [];
    const seen = new Set();
    const obsLen = obstacles.length;
    const midThresh = 10
    // Using a multiplier to form a unique key for each point
    const multiplier = 0x100000000;
  
    // Helper: adds a point if it's not inside an obstacle and hasn't been added before.
    function addPoint(p) {
      //const key = (p.x * 2) * multiplier + (p.y * 2);
      //if (!seen.has(key)) {
        //seen.add(key);
        /*if(qt.hasObstacleAt(p)){
          return
        }*/
        //console.log(`Candidates = ${candidateObstacles.length}`)
        for (const ob of obstacles) {
          if (p.x >= ob.left && p.x <= ob.right && p.y >= ob.top && p.y <= ob.bottom) {
            return;
          }
        }
        spots.push(p);
      //}else{
     // }
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
        if( (verticals[i] - verticals[i]) > midThresh){
            const xMid = (verticals[i] + verticals[i + 1]) / 2;
            addPoint({ x: xMid, y });
        }
      }
    }
  
    // 3. Add vertical edge midpoints: For each vertical line, midpoint between adjacent horizontals.
    for (const x of verticals) {
      for (let j = 0; j < horizontals.length - 1; j++) {
        if( (horizontals[j + 1] - horizontals[j]) > midThresh){
          const yMid = (horizontals[j] + horizontals[j + 1]) / 2;
          addPoint({ x, y: yMid });
        }
      }
    }
  
    // 4. Add cell centers: For each cell defined by adjacent verticals and horizontals.
    for (let i = 0; i < verticals.length - 1; i++) {
      for (let j = 0; j < horizontals.length - 1; j++) {
        if( ((verticals[i] - verticals[i]) > midThresh) && ((horizontals[j + 1] - horizontals[j]) > midThresh)){
          const xMid = (verticals[i] + verticals[i + 1]) / 2;
          const yMid = (horizontals[j] + horizontals[j + 1]) / 2;
          addPoint({ x: xMid, y: yMid });
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
            //graph.connect(a, b);
            //graph.connect(b, a);
            graph.connectBoth(a, b);
            //connections.push({ a, b });
          }
        }
  
        if (i > 0) {
          const a = makePt(hotXs[j], hotYs[i - 1]);
          if (inHotIndex(a)) {
            //graph.connect(a, b);
            //graph.connect(b, a);
            graph.connectBoth(a, b);
            //connections.push({ a, b });
          }
        }
      }
    }
  
    return { graph, connections };
  }
  
  // Solves the shortest path for the origin-destination path of the graph
  function shortestPath(graph, origin, destinationPoints, lastPath) {
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
  
  
    const matchNode = graph.calculateShortestPathFromSource(graph, originNode, destinationNodes, lastPath);
  
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
  
  // Simplifies the path by removing unnecessary points based on orthogonal pathways
  function simplifyPath(points) {
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
  
    const sz = 30
  export class OrthogonalConnector {

// Utility Point creator
    constructor(options){
      this.shapes = options.shapes.reduce((a,c)=>{a[c.id] = c; return a}, {})
      this.globalBoundsMargin = options.globalBoundsMargin
      this.shapeMargin = options.shapeMargin;
      this.bigBounds = Rectangle.fromRect(options.globalBounds);
      this.verticals = new Set();
      this.horizontals = new Set();
      this.pathCache = new Map();



      this.inflatedRects = {}

      this.inflateShapes()

      for (const b of Object.values(this.inflatedRects)) {

        this.verticals.add(Math.round(b.left / sz) * sz);
        this.verticals.add(Math.round(b.right / sz) * sz);
        this.horizontals.add(Math.round(b.top / sz) * sz);
        this.horizontals.add(Math.round(b.bottom / sz) * sz);
      }

      this.horizontals = [...this.horizontals]
      this.verticals = [...this.verticals]

    }
    inflateShape(shape){
      return Rectangle.fromRect(shape).inflate(this.shapeMargin, this.shapeMargin)
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

    moveShape(shapeId, position){
      const shape = this.shapes[shapeId]

      if( this.pathCache ){
        for(const [idx, entry] of this.pathCache){
          if( entry.shapeA.id === shapeId || entry.shapeB.id === shapeId  || OrthogonalConnector.doesPathCutThroughRectangle(Rectangle.fromRect(shape), entry.path)){
            entry.redo = true
          }
        }
      }
      shape.left = position.left
      shape.top = position.top
    }
    
  

    static getConnectionKey({ pointA, pointB }) {
      return `${pointA.shape.id}-::${pointB.shape.id}-`;
    }
    paths(){
      if( this.pathCache ){
        return [...this.pathCache.entries()].map(d=>d[1].path)
      }
      return []
    }
  

    static route(links, target) {
      const interimSpots = [];
      if( links ){
        target.links = links
      }else{
        links = target.links
      }
      
      let shapeMargin = target.shapeMargin
      const bigBounds = target.bigBounds
      
      const inflatedRects = Object.values(target.inflatedRects)
      const inflatedBounds = inflatedRects.reduce((a,c)=>a.union(c)).inflate(target.globalBoundsMargin, target.globalBoundsMargin)
  
      // Curated bounds to stick to
      const bounds = Rectangle.fromLTRB(
        Math.max(inflatedBounds.left, bigBounds.left),
        Math.max(inflatedBounds.top, bigBounds.top),
        Math.min(inflatedBounds.right, bigBounds.right),
        Math.min(inflatedBounds.bottom, bigBounds.bottom)
      );
  
      // Add edges to rulers
      let verticals = [...target.verticals]
      let horizontals = [...target.horizontals]

      const vs = new Set(verticals)
      const hs = new Set(horizontals)

      const keepPoints = []
      const shapesWithConnectors = []
      const shapeTracker = new Set()
      const termPoints = {}
      for(const opts of links){
        const { pointA, pointB } = opts;
        const key = this.getConnectionKey({pointA, pointB})
        const shapeA = Rectangle.fromRect(pointA.shape);
        const shapeB = Rectangle.fromRect(pointB.shape);

        let inflatedA = shapeA.inflate(shapeMargin - 1, shapeMargin - 1);
        let inflatedB = shapeB.inflate(shapeMargin - 1, shapeMargin - 1);
    
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

        keepPoints.push( pointA )
        keepPoints.push( pointB )

        termPoints[key] = {a:[], b:[]}

        function addVertical(d){
          if( !vs.has(d)){
            vs.add(d)
            verticals.push(d)
          }
        }
        function addHorizontal(d){
          if( !hs.has(d)){
            hs.add(d)
            horizontals.push(d)
          }
        }
    
        let termination = "a"
        for(const point of [pointA, pointB]){
          for(const side of [point.side].flat()){
            const p = computePt(point, side);
            if (isVerticalSide(side)) {
              addVertical(p.x);
            } else {
              addHorizontal(p.y);
            }

            const add = (dx, dy) => {
              const pt = makePt(p.x + dx, p.y + dy)
              interimSpots.push(pt)
              keepPoints.push(pt)
              termPoints[key][termination].push(pt)
            };
          
    
            switch (side) {
              case "top":
                add(0, -shapeMargin);
                addHorizontal(p.y - shapeMargin);
                break;
              case "right":
                add(shapeMargin, 0);
                addVertical(p.x + shapeMargin);
                break;
              case "bottom":
                add(0, shapeMargin);
                addHorizontal(p.y + shapeMargin);
                break;
              case "left":
                addVertical(p.x - shapeMargin);
                add(-shapeMargin, 0);
                break;
            }
          }
          termination = "b"
        }
      }
  
      // Sort rulers
      verticals.sort((a, b) => a - b)
      horizontals.sort((a, b) => a - b)
  
      const blocksToClear = inflatedRects.filter(d=>!keepPoints.some(d2=>d.contains(d2)))
  
  /*    if(!target.qt){
        target.qt = new FastQuadtree(target.bigBounds, 8);
        for (const b of [...blocksToClear, ...shapesWithConnectors]) {
          target.qt.insert(b);
        }
      }else{
        console.log(`REUSING QT`)
      }*/

      // Create grid
      const spots = rulersToSpotsFull(verticals, horizontals, target.qt, [...blocksToClear, ...shapesWithConnectors]);
      
      this.byproduct.spots = spots;
      this.byproduct.vRulers = verticals;
      this.byproduct.hRulers = horizontals;
      target.byproduct = this.byproduct


      
      // Add to spots
      spots.push(...interimSpots);
      const { graph, connections } = createGraph(spots);
      
      const paths = []
      for(const link of links){
        const key = this.getConnectionKey(link);

        let cached
        if (target.pathCache.has(key)) {
          cached = target.pathCache.get(key);
          if ( !cached.redo){//true){//target.isCachedPathValid(link, cached)) {
            // Reuse the cached path.
            
            paths.push([...cached.path]);
            continue;
          }
        }

        const { pointA, pointB } = link;
        let bestPath = []
        let bestScore = Infinity
        let bestStart
        let sideIdx = 0
        const aSide = [pointA.side].flat()
        for( const side of aSide){
          const origin = termPoints[key].a[sideIdx]//extrudeCp(pointA, shapeMargin);
          const start = computePt(pointA, aSide[sideIdx]);
          
          graph.startNewSearch()
          const {path, node, distance} = shortestPath(graph, origin, termPoints[key].b, cached?.path) 
          if( distance < bestScore ){
            bestPath = path ?? []
            bestScore = distance
            bestStart = start
          }
          sideIdx++        
        }
        let fullPath
        let endPrime = bestPath[bestPath.length - 1]
        if( endPrime){
          let end
          let pos = termPoints[key].b.findIndex( d=>d.x === endPrime.x && d.y === endPrime.y)
          let side = [pointB.side].flat()[pos]
          switch(side){
            case "top": end = {x: endPrime.x, y: endPrime.y + shapeMargin};break
            case "bottom": end = {x: endPrime.x, y: endPrime.y - shapeMargin};break
            case "left": end = {x: endPrime.x + shapeMargin, y: endPrime.y};break
            case "right": end = {x: endPrime.x - shapeMargin, y: endPrime.y};break
          }
          
          fullPath = simplifyPath([bestStart, ...bestPath, end]);
        }else{
          fullPath = [termPoints[key].a[0], termPoints[key].b[0]]
        }

        target.pathCache.set(key, {
          key,
          redo: false,
          path: fullPath,
          shapeA: pointA.shape,
          shapeB: pointB.shape,
        });
  
        
        paths.push(fullPath);
      }
      return paths
    }
  }