import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Arrow, Group } from "react-konva";
import { BezierLink } from "./BezierLink";
import { AutoSizer } from "./AutoSizer";
import { Checkbox } from "@heroui/react";
import useDataEvent from "./CustomHook";

/**
 * DependencyTreeKonva
 *
 * Props:
 *   - statusMap: an object where each key is a node ID and its value is an object containing
 *                at least a `children` array of child-status objects (each with an `id` field).
 *   - width: desired canvas width (default: 1000)
 *   - height: desired canvas height (default: 800)
 *
 * Example statusMap shape:
 * {
 *   "stepA": { id: "stepA", children: [ { id: "stepB" }, { id: "stepC" } ], … },
 *   "stepB": { id: "stepB", children: [ { id: "stepD" } ], … },
 *   "stepC": { id: "stepC", children: [ ], … },
 *   "stepD": { id: "stepD", children: [ ], … },
 *   // …
 * }
 */

const NODE_WIDTH = 100;
const NODE_HEIGHT = 50;

const colorMap = {
  "not_run": "#f2f2f2",
  "complete": "#ecfdf5",
  "waiting": "#fae8ff",
  "running": "#f0f9ff"
}

export default function WorkflowStructurePreview({ statusMap }) {
  // 1) Build `nodes` and `edges` arrays from statusMap
  const [showHidden, setShowHidden] = useState(true)
  const [showSkipped, setShowSkipped] = useState(true)
  const [groupByLabels, setGroupByLabels] = useState(false)
  const stageRef = useRef()


  const { nodes, edges, visibleIds } = useMemo(() => {
      const visibleIds = new Set(
        Object.entries(statusMap).filter(([id, info]) => {
            const refParams = (info.primitive.configParent ?? info.primitive).referenceParameters;
            const isVisible = showHidden ? true  : refParams?.showInMap !== false;
            const isNotSkipped = showSkipped ? true : !info.skip;
            return isVisible && isNotSkipped;
          })
          .map(([id]) => id)
      );

      // 2) Build a lookup from each node ID → its direct children IDs
      const childrenMap = {};
      Object.values(statusMap).forEach(({ id, children }) => {
        childrenMap[id] = (children || []).map((c) => c.id);
      });

      // 3) Helper: collect all visible descendants of a node, skipping over hidden ones
      const collectVisibleDescendants = (nodeId, visited = new Set()) => {
        const targets = new Set();
        const stack = [...(childrenMap[nodeId] || [])];
        while (stack.length) {
          const curr = stack.pop();
          if (visited.has(curr)) continue;
          visited.add(curr);

          if (visibleIds.has(curr)) {
            targets.add(curr);
          } else {
            // dive into this hidden node’s children
            (childrenMap[curr] || []).forEach((gc) => {
              if (!visited.has(gc)) stack.push(gc);
            });
          }
        }
        return targets;
      };

      // 4) If groupByLabels: build label→IDs map for visible nodes
      let labelGroups = null;
      if (groupByLabels) {
        labelGroups = {};
        visibleIds.forEach((id) => {
          // assume “label” is at info.primitive.configParent.label or info.primitive.label
          const {children, ...info} = statusMap[id];
          const label = (info.primitive.configParent ?? info.primitive).referenceParameters.labelFoMap;
          if (label) {
            if (!labelGroups[label]) labelGroups[label] = {ids:[], items:[]};
            labelGroups[label].ids.push(id);
            labelGroups[label].items.push(info);
          }
        });
      }

      // 5) Determine representative ID for each visible node (possibly remapped by label)
      //    repMap[id] = representative ID (either its label or itself)
      const repMap = {};
      if (groupByLabels) {
        // for each label group, pick the label string as the rep ID
        Object.entries(labelGroups).forEach(([label, {ids}]) => {
          ids.forEach((id) => {
            repMap[id] = `label:${label}`;
          });
        });
      }
      // for any visible ID not in repMap, it stays as itself
      visibleIds.forEach((id) => {
        if (!repMap[id]) repMap[id] = id;
      });

      // 6) Build nodeList: one entry per unique repMap value
      const seenReps = new Set();
      const nodeList = [];
      visibleIds.forEach((id) => {
        const rep = repMap[id];
        if (seenReps.has(rep)) return;
        seenReps.add(rep);

        if (rep.startsWith("label:")) {
          // grouped node: label = rep.slice(6)
          let label = rep.slice(6);
          const labelGroup = labelGroups[label]
          if( labelGroup.ids.length > 1){
            label += ` (${labelGroup.ids.length})`
          }
          const itemStatus = labelGroup.items.map(d=>d.primitive.processing?.flow?.status ?? "not_run").filter((d,i,a)=>a.indexOf(d)===i)
          console.log(labelGroup.items.map(d=>d.candidateForRun))
          let groupStatus = "not_run"
          if( itemStatus.includes("running")){
            groupStatus = "running"
          }else if( itemStatus.includes("waiting")){
            groupStatus = "waiting"
          }else if( itemStatus.includes("complete")){
            groupStatus = "complete"
          }
          nodeList.push({
            id: rep,
            name: label,
            status: groupStatus,
            skipped: false,
            candidateForRun: labelGroup.items.some(d=>d.candidateForRun),
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        } else {
          // ungrouped, use original info
          const info = statusMap[id];
          nodeList.push({
            id,
            name: (info.primitive.configParent ?? info.primitive).title,
            status: info.primitive.processing?.flow?.status ?? "not_run",
            candidateForRun: info.candidateForRun,
            skipped: info.skip,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        }
      });

      // 7) Build edgeList: for each visible “parent” ID, collect its visible descendants,
      //    then map parent→rep and child→rep, skipping self‐loops and duplicates.
      const edgeSet = new Set();
      visibleIds.forEach((parentId) => {
        const descendants = collectVisibleDescendants(parentId);
        descendants.forEach((childId) => {
          const repParent = repMap[parentId];
          const repChild = repMap[childId];
          if (repParent !== repChild) {
            const key = `${repParent}->${repChild}`;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
            }
          }
        });
      });

      const edgeList = Array.from(edgeSet).map((key) => {
        const [from, to] = key.split("->");
        return { from, to };
      });

      return { nodes: nodeList, edges: edgeList, visibleIds: [...visibleIds] };
  }, [statusMap, showHidden, showSkipped, groupByLabels]);
  
  useDataEvent(["set_parameter","set_field"], visibleIds, (ids, event, info, remote, items)=>{
    if( info.startsWith("processing.flow")){
      for(const p of items){
        console.log(`>>> ${p.id}`, p.processing.flow.status)
        if( stageRef.current){
          const node = stageRef.current.findOne(`#${p.id}`)?.findOne("Rect")
          if( node ){
            const nodeColor =  colorMap[p.processing.flow.status] ?? "#f2f2f2"
            node.fill( nodeColor )
          }
        }
      }
    }
  })

  // 2) Compute x/y positions for each node using a simple tree layout
  const [positions, maxX, maxY] = useMemo(() => {
    let maxX = 0, maxY = 0
    const pos = computeTreeLayout(nodes, edges, 200, 100);
    for(const p of Object.values(pos)){
      if( p.x > maxX ){maxX = p.x}
      if( p.y > maxY ){maxY = p.y}
    }
    return [pos, maxX + NODE_WIDTH, maxY + NODE_HEIGHT]
  }, [nodes, edges]);




  return (
    <AutoSizer enableResizeObserver={true}>
        {({ width, height }) => {
            const scale = Math.min(1, width / maxX * 0.95, height / maxY * 0.95 ) 
            const ox = ((width - (maxX * scale)) / 2) / scale
            const oy = ((height - (maxY * scale)) / 2) / scale
            return <>
              <Stage ref={stageRef} width={width} height={height} scaleX={scale} scaleY={scale} offsetX={-ox} offsetY={-oy}>
                <Layer>
                  {/* 4a) Draw edges as arrows */}
                  {/* Draw edges using getLinkPoints */}
                  {edges.map(({ from, to }, idx) => {
                    return (
                      <BezierLink
                      key={`arrow-${idx}`}
                      points={getLinkPoints(from, to, positions)}
                      stroke="#777"
                      strokeWidth={1}
                      pointerLength={6}
                      pointerWidth={6}
                    />
                    );
                  })}
                  {/* 4b) Draw nodes as groups of Rect + Text */}
                  {nodes.map(({ id, name, width: nodeW, height: nodeH, skipped, status, candidateForRun }) => {
                    const { x, y } = positions[id];
                    const nodeColor = candidateForRun ? "yellow" : (colorMap[status] ?? "#f2f2f2")
                    return (
                      <Group
                        key={id}
                        x={x}
                        y={y}
                        id={id}
                        opacity={skipped ? 0.5 : undefined}
                        onClick={() => console.log("Clicked node", id)}
                        onMouseEnter={(e) => {
                          const container = e.currentTarget.getStage().container();
                          container.style.cursor = "pointer";
                        }}
                        onMouseLeave={(e) => {
                          const container = e.currentTarget.getStage().container();
                          container.style.cursor = "default";
                        }}
                      >
                        <Rect
                          width={nodeW}
                          height={nodeH}
                          fill={nodeColor}
                          stroke="#999"
                          dashEnabled={skipped}
                          dash={skipped ? [5,4] : undefined}
                          strokeWidth={0.5}
                          strokeScaleEnabled={false}
                          cornerRadius={4}
                        />
                        <Text
                          text={name}
                          fontSize={14}
                          fill="#24292e"
                          width={nodeW}
                          height={nodeH}
                          align="center"
                          verticalAlign="middle"
                        />
                      </Group>
                    );
                  })}
                </Layer>
              </Stage>
              <div className="absolute right-2 top-2 bg-white border shadow-lg rounded-lg px-2 pt-1 flex flex-col space-y-1 ">
                <Checkbox size="sm" isSelected={showSkipped} onValueChange={setShowSkipped}>Show skipped</Checkbox>
                <Checkbox size="sm" isSelected={showHidden} onValueChange={setShowHidden}>Show hidden</Checkbox>
                <Checkbox size="sm" isSelected={groupByLabels} onValueChange={setGroupByLabels}>Group by labels</Checkbox>
              </div>
            </>
        }}
      </AutoSizer>
  );
}

function computeTreeLayout(nodes, edges, hSpacing = 200, vSpacing = 100) {
  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Build depthMap via BFS, and parent→children adjacency
  // ─────────────────────────────────────────────────────────────────────────
  const depthMap = {};
  const parentToChildren = {};
  const allIds = nodes.map(d=>d.id)
  const childIds = new Set();

  if( allIds.length === 0){
    return {}
  }
  // Build parent→children and collect every child ID
  allIds.forEach((id) => {
    const kids = edges.filter(d=>d.from === id).map(d=>d.to)
    parentToChildren[id] = kids;
    kids.forEach((c) => childIds.add(c));
  });

  // Identify “roots” (nodes never appearing as a child)
  let roots = allIds.filter((id) => !childIds.has(id));
  if (roots.length === 0) {
    // If there are no clear roots (disconnected/cyclical), treat all nodes as roots
    roots = [...allIds];
  }

  // BFS to assign depths
  const queue = [];
  roots.forEach((r) => {
    depthMap[r] = 0;
    queue.push(r);
  });
  while (queue.length) {
    const cur = queue.shift();
    const d = depthMap[cur];
    (parentToChildren[cur] || []).forEach((kid) => {
      const nextDepth = d + 1;
      if (depthMap[kid] === undefined || nextDepth < depthMap[kid]) {
        depthMap[kid] = nextDepth;
        queue.push(kid);
      }
    });
  }

  // Compute maxDepth
  const maxDepth = Math.max(...Object.values(depthMap));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Bucket node IDs by depth
  // ─────────────────────────────────────────────────────────────────────────
  const byDepth = Array.from({ length: maxDepth + 1 }, () => []);
  allIds.forEach((id) => {
    const d = depthMap[id] === undefined ? 0 : depthMap[id];
    byDepth[d].push(id);
  });

  // This will hold the final { x, y } for each node
  const positions = {};

  // colMeta[d] will be an array of group‐objects for column d:
  //   colMeta[d] = [
  //     { groupIds: [ … ], topY: <number>, bottomY: <number> },
  //     …
  //   ]
  const colMeta = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Process column 0 (depth = 0) – each node stands alone
  // ─────────────────────────────────────────────────────────────────────────
  {
    const depth0 = byDepth[0].slice().sort(); // stable sort by ID
    const thisCol = [];

    depth0.forEach((id, idx) => {
      const y = idx * vSpacing;
      positions[id] = { x: 0 * hSpacing, y };
      thisCol.push({
        groupIds: [id],
        topY: y,
        bottomY: y,
      });
    });

    colMeta[0] = thisCol;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Process each subsequent column d = 1 … maxDepth
  // ─────────────────────────────────────────────────────────────────────────
  for (let d = 1; d <= maxDepth; d++) {
    const idsAtDepth = byDepth[d];
    if (!idsAtDepth || idsAtDepth.length === 0) {
      colMeta[d] = [];
      continue;
    }

    // 4.1) Build “share‐parents” groups for nodes in column d
    const nodes = idsAtDepth.slice();

    // childToParents[nid] = Set of parent IDs (at depth d–1) for node nid
    const childToParents = {};
    nodes.forEach((nid) => {
      const parents = allIds.filter(
        (pid) => depthMap[pid] === d - 1 && parentToChildren[pid].includes(nid)
      );
      childToParents[nid] = new Set(parents);
    });

    // Build adjacency list: a ↔ b if childToParents[a] ∩ childToParents[b] ≠ ∅
    const adj = {};
    nodes.forEach((nid) => (adj[nid] = []));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        const parentsA = childToParents[a];
        const parentsB = childToParents[b];
        let shareParent = false;
        for (let p of parentsA) {
          if (parentsB.has(p)) {
            shareParent = true;
            break;
          }
        }
        if (shareParent) {
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    }

    // Find connected components (DFS) in this adjacency graph
    const visited = new Set();
    const groups = [];
    function dfs(u, comp) {
      visited.add(u);
      comp.push(u);
      adj[u].forEach((nbr) => {
        if (!visited.has(nbr)) dfs(nbr, comp);
      });
    }
    nodes.forEach((nid) => {
      if (!visited.has(nid)) {
        const comp = [];
        dfs(nid, comp);
        groups.push(comp);
      }
    });

    // 4.2) Within each group, separate “extra‐parent” nodes first (optional)
    const orderedGroups = groups.map((comp) => {
      // Intersection I of all parent sets in this component
      const parentSets = comp.map((nid) => childToParents[nid]);
      const I = new Set(parentSets[0]);
      parentSets.slice(1).forEach((s) => {
        for (let x of Array.from(I)) {
          if (!s.has(x)) I.delete(x);
        }
      });

      // Partition comp into extra‐parent vs. core
      const extra = [];
      const core = [];
      comp.forEach((nid) => {
        const ps = childToParents[nid];
        let isExtra = false;
        if (ps.size > I.size) {
          isExtra = true;
        } else {
          for (let x of ps) {
            if (!I.has(x)) {
              isExtra = true;
              break;
            }
          }
        }
        if (isExtra) extra.push(nid);
        else core.push(nid);
      });

      extra.sort();
      core.sort();
      return extra.concat(core);
    });

    // 4.3) Determine group ordering by parents’ positions in column (d–1)
    const parentMeta = colMeta[d - 1] || [];
    function findMinParentTop(nid) {
      // All parents of nid at depth d–1
      const parents = allIds.filter(
        (pid) => depthMap[pid] === d - 1 && parentToChildren[pid].includes(nid)
      );
      if (parents.length === 0) {
        return parentMeta.length
          ? parentMeta[parentMeta.length - 1].bottomY + vSpacing
          : 0;
      }
      // Map each parent to its group’s topY in parentMeta
      const parentYs = parents.map((p) => {
        for (let g of parentMeta) {
          if (g.groupIds.includes(p)) {
            return g.topY;
          }
        }
        return parentMeta.length
          ? parentMeta[parentMeta.length - 1].bottomY + vSpacing
          : 0;
      });
      return Math.min(...parentYs);
    }

    // Build an array of { groupNodes, sortKey }
    const groupObjects = orderedGroups.map((grp) => {
      const parentYs = grp.map((nid) => findMinParentTop(nid));
      return { groupNodes: grp, sortKey: Math.min(...parentYs) };
    });
    groupObjects.sort((a, b) => a.sortKey - b.sortKey);

    // 4.4) Place each group, centering under parents when possible:
    const thisCol = [];
    groupObjects.forEach(({ groupNodes }, idx) => {
      // (1) Compute “ideal center Y” = avg of parent‐group centers
      const parentCenters = [];
      groupNodes.forEach((nid) => {
        const parents = allIds.filter(
          (pid) =>
            depthMap[pid] === d - 1 && parentToChildren[pid].includes(nid)
        );
        parents.forEach((p) => {
          const parentEntry = parentMeta.find((g) =>
            g.groupIds.includes(p)
          );
          if (parentEntry) {
            const centerY =
              (parentEntry.topY + parentEntry.bottomY) / 2;
            parentCenters.push(centerY);
          }
        });
      });
      const idealCenterY =
        parentCenters.length > 0
          ? parentCenters.reduce((a, b) => a + b, 0) /
            parentCenters.length
          : 0;

      // (2) Compute groupHeight = (N - 1) * vSpacing
      const groupHeight = (groupNodes.length - 1) * vSpacing;

      // (3) Desired topY = idealCenterY - (groupHeight / 2)
      let topY = idealCenterY - groupHeight / 2;
      let bottomY = topY + groupHeight;

      // (4) Avoid overlapping the previous group in this column
      if (idx > 0) {
        const prevGroup = thisCol[idx - 1];
        const prevBottom = prevGroup.bottomY;
        if (topY < prevBottom + vSpacing) {
          topY = prevBottom + vSpacing;
          bottomY = topY + groupHeight;
        }
      }

      // (5) Place each node in groupNodes at y = topY + (i * vSpacing)
      groupNodes.forEach((nid, i) => {
        positions[nid] = {
          x: d * hSpacing,
          y: topY + i * vSpacing,
        };
      });

      // (6) Record this group’s vertical interval
      thisCol.push({
        groupIds: groupNodes,
        topY,
        bottomY,
      });
    });

    colMeta[d] = thisCol;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Final shift if any Y < 0
  // ─────────────────────────────────────────────────────────────────────────
  const allYs = Object.values(positions).map((p) => p.y);
  const minY = Math.min(...allYs);
  if (minY < 0) {
    const shiftAmt = -minY;
    Object.values(positions).forEach((p) => {
      p.y += shiftAmt;
    });
  }

  return positions;
}
function getLinkPoints(fromId, toId, positions) {
  const { x: px, y: py } = positions[fromId];
  const { x: cx, y: cy } = positions[toId];

  // 1) Anchor the start on the right‐center of the parent box:
  const startX = px + NODE_WIDTH;
  const startY = py + NODE_HEIGHT / 2;

  // 2) Anchor the end on the left‐center of the child box:
  const endX = cx;
  const endY = cy + NODE_HEIGHT / 2;

  const dx = endX - startX;

  const cp1X = startX + dx * 0.85;
  const cp1Y = startY;

  const cp2X = startX + dx * 0.15;
  const cp2Y = endY;

  return [startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY];
}