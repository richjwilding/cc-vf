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
      this.adjacentNodes = new Map();
    }
  }
  
  class PointGraph {
    constructor() {
      this.index = {};
    }

    resetNodes(){

      for(const xs in this.index){
        for(const ys in this.index[xs]){
          this.index[xs][ys].distance = Number.MAX_SAFE_INTEGER;
          this.index[xs][ys].previousNode = undefined
          this.index[xs][ys].settled = undefined

        }
      }
    }
  
    add(p) {
      const { x, y } = p;
      const xs = x.toString(),
        ys = y.toString();
  
      if (!(xs in this.index)) {
        this.index[xs] = {};
      }
      if (!(ys in this.index[xs])) {
        this.index[xs][ys] = new PointNode(p);
      }
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
  
      calculateShortestPathFromSource(graph, source, destinationNode, lastPath) {
        source.distance = 0;
        const minHeap = new MinHeap();
        minHeap.insert(source);
        
        while (!minHeap.isEmpty()) {
          const currentNode = minHeap.extractMin();
      
          if (currentNode === destinationNode) {
            return graph;
          }
          
          currentNode.settled = true
      
          for (const [adjacentNode, edgeWeight] of currentNode.adjacentNodes) {
            if (!adjacentNode.settled) {
             if( this.calculateMinimumDistance(adjacentNode, edgeWeight, currentNode, lastPath)){
               minHeap.insert(adjacentNode);
              }
            }
          }
        }
        return graph;
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
      const extraWeigh = changingDirection ? Math.pow(edgeWeigh + 1, 2) : 0;
  
      const deviationCost = previousPath ? this.computeDeviationCost(evaluationNode, previousPath, 50) : 0

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
  
    connect(a, b) {
      const nodeA = this.get(a);
      const nodeB = this.get(b);
  
      if (!nodeA || !nodeB) {
        throw new Error(`A point was not found`);
      }
  
      nodeA.adjacentNodes.set(nodeB, distance(a, b));
    }
  
    has(p) {
      const { x, y } = p;
      const xs = x.toString(),
        ys = y.toString();
      return xs in this.index && ys in this.index[xs];
    }
  
    get(p) {
      const { x, y } = p;
      const xs = x.toString(),
        ys = y.toString();
  
      if (xs in this.index && ys in this.index[xs]) {
        return this.index[xs][ys];
      }
      return null;
    }
  }
  
  // Gets the actual point of the connector based on the distance parameter
  function computePt(p) {
    const b = Rectangle.fromRect(p.shape);
    switch (p.side) {
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
  
  // Extrudes the connector point by margin depending on its side
  function extrudeCp(cp, margin) {
    const { x, y } = computePt(cp);
    switch (cp.side) {
      case "top":
        return makePt(x, y - margin);
      case "right":
        return makePt(x + margin, y);
      case "bottom":
        return makePt(x, y + margin);
      case "left":
        return makePt(x - margin, y);
    }
  }
  
  // Returns flag indicating if the side belongs on a vertical axis
  function isVerticalSide(side) {
    return side === "top" || side === "bottom";
  }
  
  // Creates a grid of rectangles from the specified set of rulers, contained on the specified bounds
  function rulersToGrid(verticals, horizontals, bounds) {
    const result = new Grid();
  
    verticals.sort((a, b) => a - b);
    horizontals.sort((a, b) => a - b);
  
    let lastX = bounds.left;
    let lastY = bounds.top;
    let column = 0;
    let row = 0;
  
    for (const y of horizontals) {
      for (const x of verticals) {
        result.set(row, column++, Rectangle.fromLTRB(lastX, lastY, x, y));
        lastX = x;
      }
  
      // Last cell of the row
      result.set(row, column, Rectangle.fromLTRB(lastX, lastY, bounds.right, y));
      lastX = bounds.left;
      lastY = y;
      column = 0;
      row++;
    }
  
    lastX = bounds.left;
  
    // Last row of cells
    for (const x of verticals) {
      result.set(row, column++, Rectangle.fromLTRB(lastX, lastY, x, bounds.bottom));
      lastX = x;
    }
  
    // Last cell of last row
    result.set(row, column, Rectangle.fromLTRB(lastX, lastY, bounds.right, bounds.bottom));
  
    return result;
  }
  
  function reducePoints(points) {
    const seen = new Set();
    const result = [];
    for (const p of points) {
      const key = `${p.x},${p.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(p);
      }
    }
    return result;
  }
  
  // Returns a set of spots generated from the grid, avoiding colliding spots with specified obstacles
  function gridToSpots(grid, obstacles) {
    const obstacleCollision = (p) =>
      obstacles.some(o => o.contains(p));
  
    const gridPoints = [];
  
    for (const [row, data] of grid.data) {
      const firstRow = row === 0;
      const lastRow = row === grid.rows - 1;
  
      for (const [col, r] of data) {
        const firstCol = col === 0;
        const lastCol = col === grid.columns - 1;
        const nw = firstCol && firstRow;
        const ne = firstRow && lastCol;
        const se = lastRow && lastCol;
        const sw = lastRow && firstCol;

  
        if (nw || ne || se || sw) {
          gridPoints.push(r.northWest, r.northEast, r.southWest, r.southEast);
        } else if (firstRow) {
          gridPoints.push(r.northWest, r.north, r.northEast);
        } else if (lastRow) {
          gridPoints.push(r.southEast, r.south, r.southWest);
        } else if (firstCol) {
          gridPoints.push(r.northWest, r.west, r.southWest);
        } else if (lastCol) {
          gridPoints.push(r.northEast, r.east, r.southEast);
        } else {
          gridPoints.push(
            r.northWest, r.north, r.northEast, r.east,
            r.southEast, r.south, r.southWest, r.west, r.center
          );
        }
      }
    }
  
    // Reduce repeated points and filter out those that touch shapes
    return reducePoints(gridPoints).filter(p => !obstacleCollision(p));
  }
  
  // Creates a graph connecting the specified points orthogonally
  function createGraph(spots) {
    const hotXs = [];
    const hotYs = [];
    const graph = new PointGraph();
    const connections = [];
  
    spots.forEach(p => {
      const { x, y } = p;
      if (hotXs.indexOf(x) < 0) hotXs.push(x);
      if (hotYs.indexOf(y) < 0) hotYs.push(y);
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
            graph.connect(a, b);
            graph.connect(b, a);
            connections.push({ a, b });
          }
        }
  
        if (i > 0) {
          const a = makePt(hotXs[j], hotYs[i - 1]);
          if (inHotIndex(a)) {
            graph.connect(a, b);
            graph.connect(b, a);
            connections.push({ a, b });
          }
        }
      }
    }
  
    return { graph, connections };
  }
  
  // Solves the shortest path for the origin-destination path of the graph
  function shortestPath(graph, origin, destination, lastPath) {
    const originNode = graph.get(origin);
    const destinationNode = graph.get(destination);
  
    if (!originNode) {
      console.error(`Origin node {${origin.x},${origin.y}} not found`);
      return
    }
  
    if (!destinationNode) {
      console.error(`Destination node {${destination.x},${destination.y}} not found`);
      return
    }
  
    graph.calculateShortestPathFromSource(graph, originNode, destinationNode, lastPath);
  
    const shortestPath = graph.reconstructPath(destinationNode)
    return shortestPath.map(n => n.data);
    //return destinationNode.shortestPath.map(n => n.data);
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
          if( OrthogonalConnector.doesPathCutThroughRectangle(Rectangle.fromRect(shape), entry.path)){
            entry.redo = true
          }
        }
      }
      shape.left = position.left
      shape.top = position.top
    }
    
  

    static getConnectionKey({ pointA, pointB }) {
      return `${pointA.shape.id}-${pointA.side}-${pointA.distance}::${pointB.shape.id}-${pointB.side}-${pointB.distance}`;
    }
    paths(){
      if( this.pathCache ){
        return [...this.pathCache.entries()].map(d=>d[1].path)
      }
      return []
    }
  

    static route(links, target) {
      const spots = [];
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
      const verticals = [...target.verticals]
      const horizontals = [...target.horizontals]


      const keepPoints = []
      const shapesWithConnectors = []
      const shapeTracker = new Set()
      for(const opts of links){
        const { pointA, pointB } = opts;
        const sideA = pointA.side, sideAVertical = isVerticalSide(sideA);
        const sideB = pointB.side, sideBVertical = isVerticalSide(sideB);
        const originA = computePt(pointA);
        const originB = computePt(pointB);
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
    
    

        // Rulers at origins of shapes
        if (sideAVertical) {
          verticals.push(originA.x);
        } else {
          horizontals.push(originA.y);
        }
        if (sideBVertical) {
          verticals.push(originB.x);
        } else {
          horizontals.push(originB.y);
        }
        // Points of shape antennas

        keepPoints.push( pointA )
        keepPoints.push( pointB )

        for (const connectorPt of [pointA, pointB]) {
          const p = computePt(connectorPt);
          const add = (dx, dy) => {
            const pt = makePt(p.x + dx, p.y + dy)
            spots.push(pt)
            keepPoints.push(pt)
          };
          
    
          switch (connectorPt.side) {
            case "top":
              add(0, -shapeMargin);
              horizontals.push(p.y - shapeMargin);
              break;
            case "right":
              add(shapeMargin, 0);
              verticals.push(p.x + shapeMargin);
              break;
            case "bottom":
              add(0, shapeMargin);
              horizontals.push(p.y + shapeMargin);
              break;
            case "left":
              verticals.push(p.x - shapeMargin);
              add(-shapeMargin, 0);
              break;
          }
        }
      }
  
      // Sort rulers
      verticals.sort((a, b) => a - b);
      horizontals.sort((a, b) => a - b);
  
      // find empt chunks
      let minX = verticals[0], maxX = verticals[verticals.length - 1]
      let minY = verticals[0], maxY = verticals[verticals.length - 1]
      const clearedblocks = []
      let blockSz = sz * 4
/*
      const populated = new Set()
      function getGridPos({x,y}){
        return Math.floor( x / blockSz) + "-" + Math.floor( y / blockSz)
      }
      inflatedRects.forEach(d=>{
        populated.add( getGridPos(d.northWest) )
        populated.add( getGridPos(d.northEast) )
        populated.add( getGridPos(d.southWest) )
        populated.add( getGridPos(d.southEast) )
      })
      
      let hsz = sz / 2
      for( let x = minX, i =0; x < maxX; x += blockSz, i++){
        for( let y = minY, j = 0; y < maxY; y += blockSz, j++){
          if( !populated.has(i + "-" + j)){
            clearedblocks.push(Rectangle.fromRect({left: x + hsz, top:y + hsz, width: blockSz - sz, height: blockSz - sz}))
          }
        }
      }
*/
      const blocksToClear = inflatedRects.filter(d=>!keepPoints.some(d2=>d.contains(d2)))

      // Create grid
      const grid = rulersToGrid(verticals, horizontals, bounds);
      //const gridPoints = gridToSpots(grid, [...blocksToClear, ...shapesWithConnectors]);
      const gridPoints = gridToSpots(grid, [...blocksToClear ]);
      this.byproduct.spots = spots;
      this.byproduct.vRulers = verticals;
      this.byproduct.hRulers = horizontals;
      this.byproduct.grid = grid.rectangles();
      this.byproduct.clearedblocks = clearedblocks
      target.byproduct = this.byproduct


      
      // Add to spots
      spots.push(...gridPoints);
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
        const origin = extrudeCp(pointA, shapeMargin);
        const destination = extrudeCp(pointB, shapeMargin);
    
        const start = computePt(pointA);
        const end = computePt(pointB);
    
        
        const path = shortestPath(graph, origin, destination, cached?.path) ?? []

        const fullPath = simplifyPath([start, ...path, destination, end]);

        target.pathCache.set(key, {
          key,
          redo: false,
          path: fullPath,
          origin: computePt(pointA),
          destination: computePt(pointB),
        });
  
        
        paths.push(fullPath);
        graph.resetNodes()
      }
      return paths
    }
  }