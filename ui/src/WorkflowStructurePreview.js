import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Arrow, Group, Image } from "react-konva";
import { BezierLink } from "./BezierLink";
import { AutoSizer } from "./AutoSizer";
import { Checkbox } from "@heroui/react";
import useDataEvent from "./CustomHook";
import { convertIconForKonva, renderReactSVGIcon } from "./RenderHelpers";
import { HeroIcon } from "./HeroIcon";
import { StaticImage } from "./StaticImage";
import Konva from "konva";

import dagre from 'dagre';
import AnimatedKonvaProgressBar from "./AnimatedKonvaProgressBar";

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
const NODE_HEIGHT = 60;

const colorMap = {
  "not_run": {base: "#f2f2f2", highlight: "#333"},
  "complete": {base: "#ecfdf5", highlight: "#34d399"},
  "waiting": {base: "#fef08a", highlight: "#f59e0b"},
  "running": {base: "#e0f2fe", highlight: "#0ea5e9"},
  "error": {base: "#ffdddd", highlight: "#333"},
  "error_skip": {base: "#ff2244", highlight: "#333"}
}

export default function WorkflowStructurePreview({ statusMap }) {
  // 1) Build `nodes` and `edges` arrays from statusMap
  const [showHidden, setShowHidden] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const [groupByLabels, setGroupByLabels] = useState(true)
  const stageRef = useRef()
  const layerRef = useRef()
  const offsetRef = useRef(0);
  const [update, setUpdate] = useState({})


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
          const label = (info.primitive.configParent ?? info.primitive).referenceParameters.labelForMap;
          const icon = info.primitive.configParent?.metadata?.icon
          if (label) {
            if (!labelGroups[label]) labelGroups[label] = {ids:[], items:[], icon};
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
            status: ()=>groupStatus,
            progress:()=>{
              const progressList = labelGroup.items.map(d=>d.primitive.percentageProgress)
              const progress = Math.min(...progressList.filter(d=>d!==undefined))
              return progress
            },
            skipped: false,
            candidateForRun: labelGroup.items.some(d=>d.candidateForRun),
            icon: labelGroup.icon,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        } else {
          // ungrouped, use original info
          const info = statusMap[id];
          nodeList.push({
            id,
            name: (info.primitive.configParent ?? info.primitive).title,
            status: ()=>info.primitive.processing?.flow?.status ?? "not_run",
            progress: ()=>info.primitive.percentageProgress,
            //progress: ()=>({percentage: 0.35}),
            candidateForRun: info.candidateForRun,
            skipped: info.skip,
            icon: info.primitive.configParent?.metadata?.icon,
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

  function doUpdate(thisUpdate){
    setUpdate(prev => {
      const next = { ...prev };
      for (const key of Object.keys(thisUpdate)) {
        next[key] = (next[key] ?? 0) + 1;
      }
      return next;
    });
  }
  
  useDataEvent(["set_parameter","set_field"], visibleIds, (ids, event, info, remote, items)=>{
    if( info.startsWith("processing.flow")){
      const newState = {}
      for(const p of items){
        console.log(`>>> ${p.id}`, p.processing.flow.status)
        /*if( stageRef.current){
          const node = stageRef.current.findOne(`#${p.id}`)?.findOne("Rect")
          if( node ){
            const nodeColor =  colorMap[p.processing.flow.status] ?? "#f2f2f2"
            node.fillLinearGradientColorStops([
                                0, 'red',   // light blue
                                //0.9, '#e6f4ff'    // pastel pink
                                0.9, nodeColor.base    // pastel pink
                          ])
          }
        }*/
       newState[p.id] = true
      }
     doUpdate(newState)
    }
  })

  // 2) Compute x/y positions for each node using a simple tree layout
  const [positions, maxX, maxY] = useMemo(() => {
    let maxX = 0, maxY = 0
    const pos = computeTreeLayout(nodes, edges, NODE_WIDTH * 1, NODE_HEIGHT * 1);
    for(const p of Object.values(pos)){
      if( p.x > maxX ){maxX = p.x}
      if( p.y > maxY ){maxY = p.y}
    }
    return [pos, maxX + NODE_WIDTH, maxY + NODE_HEIGHT]
  }, [nodes, edges]);



  useEffect(() => {
    if( layerRef.current){

      const layer = layerRef.current;
      const anim = new Konva.Animation(() => {
        offsetRef.current -= 1.2; // speed
        // find all running-rects by a custom class name:
        layer.find('.running').forEach((shape) => {
          shape.dashOffset(offsetRef.current);
        });
      }, layer);
      anim.start();
      return () => anim.stop();
    }
  }, [layerRef.current]);

  return (
    <AutoSizer enableResizeObserver={true}>
        {({ width, height }) => {
            const scale = Math.min(1, width / maxX * 0.95, height / maxY * 0.95 ) 
            const ox = ((width - (maxX * scale)) / 2) / scale
            const oy = ((height - (maxY * scale)) / 2) / scale
            let anyRunning = false
            return <>
              <Stage ref={stageRef} width={width} height={height} scaleX={scale} scaleY={scale} offsetX={-ox} offsetY={-oy}>
                <Layer ref={layerRef}>
                  {/* 4a) Draw edges as arrows */}
                  {/* Draw edges using getLinkPoints */}
                  {edges.map(({ from, to }, idx) => {
                    let running = nodes.find(d=>d.id === to)?.status() === "running"
                    anyRunning ||= running
                    return (
                      <BezierLink
                      key={`arrow-${idx}`}
                      points={getLinkPoints(from, to, positions)}
                      stroke="#76a3ff"
                      dashEnabled={running}
                      dash={[6,4]}
                      dashOffset={0}
                      name={running ? "running" : ""}
                      strokeWidth={1}
                      pointerLength={6}
                      pointerWidth={6}
                    />
                    );
                  })}
                  {/* 4b) Draw nodes as groups of Rect + Text */}
                  {nodes.map(({ id, name, width: nodeW, height: nodeH, skipped, status, progress, icon, candidateForRun }) => {
                    status = status()
                    progress = progress()
                    const { x, y } = positions[id];
                    const padding = [NODE_HEIGHT * 0.1, NODE_WIDTH * 0.05]
                    const isRunning = status === 'running';
                    let renderedIcon = <></>
                    let hasIcon = false
                    if( icon ){
                      renderedIcon = convertIconForKonva( <HeroIcon icon={icon} className="w-5 h-5"/>, {width: 28, height: 28}).icon
                      hasIcon = true
                    }
                    const nodeColor = (!anyRunning && candidateForRun) ? {base: "#f3e8ff", highlight: "#c084fc"} : (colorMap[status] ?? {base: "#f2f2f2", highlight:"#333"})
                    return (
                      <Group
                        key={id}
                        x={x}
                        y={y}
                        update={update[id] ?? 0}
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
                        {isRunning && <>
                                      <Rect 
                                        width={nodeW + 30}
                                        height={nodeH + (progress ? 46 : 30)}
                                        x={-15}
                                        y={-15}
                                        cornerRadius={20}
                                        dashEnabled={true}
                                        name="running"
                                        dash={[6, 4]}
                                        dashOffset={0}
                                        strokeWidth={1.5}
                                        stroke={nodeColor.highlight}
                                        />
                                        {progress && <AnimatedKonvaProgressBar x={0} y={nodeH+10} progress={progress} width={nodeW} height={12} stripeColor={nodeColor.highlight} backgroundColor={nodeColor.base}/>}
                        </>}
                        <Rect
                          width={nodeW}
                          height={nodeH}
                          //fill={nodeColor}
                          dashEnabled={skipped}
                          dash={skipped ? [5,4] : undefined}
                          strokeScaleEnabled={false}
                          cornerRadius={4}
                          fillLinearGradientStartPoint={{ x: NODE_WIDTH / 3, y: 0 }}
                          fillLinearGradientEndPoint={{ x: NODE_WIDTH / 2, y: NODE_HEIGHT }}
                          fillLinearGradientColorStops={[
                                0, 'white',   // light blue
                                //0.5, '#d1c4e9', // soft lavender
                                0.9, nodeColor.base,
                          ]}
                          // Outline
                          //stroke='#b7d8ff'
                          stroke={nodeColor.highlight}
                          strokeWidth= {1}
                          shadowColor = '#000000'
                          shadowBlur = {6}
                          shadowOffset ={{ x: 2, y: 2 }}
                          shadowOpacity = {0.08}
                        />
                        {renderedIcon && <StaticImage x={(nodeW - 28) / 2} y={padding[0] / 2} color={nodeColor.highlight} svgString={renderedIcon} width={28} height={28}/>}
                        <Text
                          text={name}
                          fontSize={10}
                          fill="#24292e"
                          x={padding[1]}
                          y={padding[0] + (hasIcon ? 28 : 0)}
                          width={nodeW - (padding[1] * 2)}
                          height={nodeH - (padding[0] * 2)}
                          align="center"
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
  // 1) Build a new directed graph
  const g = new dagre.graphlib.Graph({ directed: true });
  g.setGraph({ rankdir: 'LR', edgesep: vSpacing, ranksep: hSpacing, ranker: "network-simplex" });
  g.setDefaultEdgeLabel(() => ({}));

  // 2) Add nodes (you can give them fixed width/height if you know it)
  nodes.forEach(n => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  // 3) Add edges
  edges.forEach(e => g.setEdge(e.from, e.to));

  // 4) Compute Sugiyama layout
  dagre.layout(g);

  // 5) Extract positions
  const positions = {};
  nodes.forEach(n => {
    const { x, y } = g.node(n.id);
    positions[n.id] = { x, y };
  });
  return positions;
}

function int_computeTreeLayout(nodes, edges, hSpacing = 200, vSpacing = 100) {
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Build adjacency + find “longest” depths via BFS + relaxation
  // ─────────────────────────────────────────────────────────────────────────
  const originalIds = nodes.map(n => n.id);
  const parentToChildren = {};
  const childIds = new Set();

  originalIds.forEach(id => {
    const kids = edges.filter(e => e.from === id).map(e => e.to);
    parentToChildren[id] = kids;
    kids.forEach(c => childIds.add(c));
  });

  // roots = nodes never seen as a child
  let roots = originalIds.filter(id => !childIds.has(id));
  if (!roots.length) roots = originalIds.slice();

  // BFS to get some initial depths (we'll flip to longest-path below)
  const originalDepth = {};
  const queue = [];
  roots.forEach(r => {
    originalDepth[r] = 0;
    queue.push(r);
  });
  while (queue.length) {
    const cur = queue.shift();
    const d   = originalDepth[cur];
    (parentToChildren[cur] || []).forEach(kid => {
      const nd = d + 1;
      // <— choose the deeper assignment
      if (originalDepth[kid] === undefined || nd > originalDepth[kid]) {
        originalDepth[kid] = nd;
        queue.push(kid);
      }
    });
  }

  // STEP 1.5: enforce “deepest-parent + 1” until stable
  const depthMap = { ...originalDepth };
  let changed = true;
  while (changed) {
    changed = false;
    originalIds.forEach(id => {
      const pars = originalIds.filter(p => (parentToChildren[p]||[]).includes(id));
      if (pars.length) {
        const target = Math.max(...pars.map(p => depthMap[p])) + 1;
        if ((depthMap[id]||0) < target) {
          depthMap[id] = target;
          changed = true;
        }
      }
    });
  }

  // STEP 1.6: inject phantoms under any shallow parent (and remove direct link)
  let phantomCount = 0;
  function ensureEntry(x) { if (!parentToChildren[x]) parentToChildren[x] = []; }

  originalIds.forEach(child => {
    let pars = originalIds.filter(p => (parentToChildren[p]||[]).includes(child));
    pars.forEach(parent => {
      let pd = depthMap[parent], cd = depthMap[child];
      while (pd + 1 < cd) {
        const ph = `_phantom_${phantomCount++}`;
        depthMap[ph] = pd + 1;
        // remove direct parent→child
        parentToChildren[parent] = parentToChildren[parent].filter(x => x !== child);
        // insert parent→phantom→child
        parentToChildren[parent].push(ph);
        parentToChildren[ph] = [child];
        // chain
        parent = ph;
        pd++;
      }
    });
  });

  // collect all IDs (real + phantom)
  const layoutIds = Object.keys(depthMap);
  const maxDepth = Math.max(...layoutIds.map(id => depthMap[id]));

  // STEP 2: bucket by depth
  const byDepth = Array.from({ length: maxDepth + 1 }, () => []);
  layoutIds.forEach(id => byDepth[depthMap[id]].push(id));

  // helpers for Step 4.4.5
  function countCrossings(col, nextCol, parentToChildren) {
    let c = 0, edges = [];
    col.forEach((src, i) => {
      (parentToChildren[src]||[]).forEach(dst => {
        const j = nextCol.indexOf(dst);
        if (j >= 0) edges.push([i, j]);
      });
    });
    for (let a = 0; a < edges.length; a++) {
      for (let b = a + 1; b < edges.length; b++) {
        const [i1, j1] = edges[a], [i2, j2] = edges[b];
        if ((i1 < i2 && j1 > j2) || (i1 > i2 && j1 < j2)) c++;
      }
    }
    return c;
  }
  
  // modified to consider both sides
  function minimizeCrossingsBothSides(prevCol, thisCol, nextCol, parentToChildren) {
    // we’ll do a few bubble‐passes L→R then R→L
    for (let pass = 0; pass < 4; pass++) {
      const leftToRight = pass % 2 === 0;
      let improved = true;
  
      while (improved) {
        improved = false;
        const start = leftToRight ? 0 : thisCol.length - 2;
        const end   = leftToRight ? thisCol.length - 1 : -1;
        const step  = leftToRight ? +1 : -1;
  
        for (let i = start; i !== end; i += step) {
          // total crossings before
          const before =
            countCrossings(prevCol, thisCol, parentToChildren) +
            countCrossings(thisCol, nextCol, parentToChildren);
  
          // try the adjacent swap
          [thisCol[i], thisCol[i+1]] = [thisCol[i+1], thisCol[i]];
  
          // total crossings after
          const after =
            countCrossings(prevCol, thisCol, parentToChildren) +
            countCrossings(thisCol, nextCol, parentToChildren);
  
          if (after < before) {
            improved = true;  // keep it
          } else {
            // revert
            [thisCol[i], thisCol[i+1]] = [thisCol[i+1], thisCol[i]];
          }
        }
      }
    }
  }

  if( !byDepth[0] ){
    return {}
  }

  // STEP 3…5 containers
  const positions = {}, colMeta = [];

  // STEP 3: depth 0
  {
    const col0 = byDepth[0].slice().sort();
    const meta = [];
    col0.forEach((id,i) => {
      const y = i * vSpacing;
      positions[id] = { x:0, y };
      meta.push({ groupIds:[id], topY:y, bottomY:y });
    });
    colMeta[0] = meta;
  }

  // STEP 4: depths 1…maxDepth
  for (let d=1; d<=maxDepth; d++){
    const ids = byDepth[d]||[];
    if (!ids.length) { colMeta[d]=[]; continue; }

    // 4.1: map child→parents at d-1
    const childToParents = {};
    ids.forEach(id=>{
      childToParents[id] = new Set(
        byDepth[d-1].filter(p=>(parentToChildren[p]||[]).includes(id))
      );
    });

    // 4.2: build share-parent adjacency & components
    const adj = {}; ids.forEach(id=>adj[id]=[]);
    for(let i=0;i<ids.length;i++){
      for(let j=i+1;j<ids.length;j++){
        const [a,b]=[ids[i],ids[j]];
        for(const p of childToParents[a]){
          if(childToParents[b].has(p)){
            adj[a].push(b); adj[b].push(a);
            break;
          }
        }
      }
    }
    const visited=new Set(), groups=[];
    function dfs(u,comp){
      visited.add(u); comp.push(u);
      adj[u].forEach(n=>{ if(!visited.has(n)) dfs(n,comp); });
    }
    ids.forEach(id=>{ if(!visited.has(id)){ const c=[]; dfs(id,c); groups.push(c);} });

    // 4.3: within-group extra-first
    const ordered = groups.map(comp=>{
      const sets = comp.map(id=>childToParents[id]);
      const I = new Set(sets[0]);
      sets.slice(1).forEach(s=>{ for(let x of I) if(!s.has(x)) I.delete(x); });
      const extra=[], core=[];
      comp.forEach(id=>{
        const ps=childToParents[id];
        const isExtra = ps.size> I.size || [...ps].some(x=>!I.has(x));
        (isExtra?extra:core).push(id);
      });
      extra.sort(); core.sort();
      return extra.concat(core);
    });

    // 4.4: sort groups by parents’ topY
    const prevMeta = colMeta[d-1]||[];
    function minTop(id){
      const ps=[...childToParents[id]];
      if(!ps.length){
        return prevMeta.length
          ? prevMeta[prevMeta.length-1].bottomY + vSpacing
          : 0;
      }
      return Math.min(...ps.map(p=>{
        const g = prevMeta.find(m=>m.groupIds.includes(p));
        return g? g.topY : 0;
      }));
    }
    const groupObjs = ordered
      .map(grp=>({ grp, key: Math.min(...grp.map(minTop)) }))
      .sort((a,b)=>a.key - b.key);

    // 4.4.5: untangle crossing vs prev column
    const flat = groupObjs.flatMap(o=>o.grp);
    const prev = byDepth[d - 1];
    const next = byDepth[d + 1] || [];
    minimizeCrossingsBothSides(prev, flat, next, parentToChildren);

    // re-chunk into untangled groups
    const untangled = [], sizes = groupObjs.map(o=>o.grp.length);
    let idx = 0;
    sizes.forEach(len=>{
      untangled.push(flat.slice(idx, idx+len));
      idx += len;
    });


    
    // 4.5: assign x,y and build this column’s meta
    const thisColMeta = [];

    untangled.forEach((grp, gi) => {
      // If this is a single-node group with exactly one parent, pin it there:
      if (grp.length === 1) {
        const id = grp[0];
        const parents = Array.from(childToParents[id] || []);
        if (parents.length === 1) {
          const pid = parents[0];
          const px = d * hSpacing;
          const py = positions[pid].y;
          const y  = py //+ vSpacing;

          positions[id] = { x: px, y };
          thisColMeta.push({
            groupIds: [id],
            topY:    y,
            bottomY: y,
          });
          return;  // done with this group
        }
      }

      // …otherwise use your normal “ideal center” logic:
      // 1) Compute idealCenterY under deepest parent
      const allPars = grp.flatMap(id => [...childToParents[id]]);
      const maxPd   = Math.max(...allPars.map(p => depthMap[p] || 0));
      const anchors = allPars.filter(p => depthMap[p] === maxPd);
      const parentCenters = anchors.map(p => {
        const m = colMeta[d - 1].find(m => m.groupIds.includes(p));
        return m ? (m.topY + m.bottomY) / 2 : 0;
      });
      const idealCenterY = parentCenters.length
        ? parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length
        : 0;

      // 2) Compute height and topY
      const groupHeight = (grp.length - 1) * vSpacing;
      let topY = idealCenterY - groupHeight / 2;
      if (gi > 0) {
        const prev = thisColMeta[gi - 1];
        if (topY < prev.bottomY + vSpacing) {
          topY = prev.bottomY + vSpacing;
        }
      }
      const bottomY = topY + groupHeight;

      // 3) Assign positions for every node in grp
      grp.forEach((id, i) => {
        positions[id] = {
          x: d * hSpacing,
          y: topY + i * vSpacing
        };
      });

      // 4) Record this group’s vertical span
      thisColMeta.push({ groupIds: grp, topY, bottomY });
    });

    colMeta[d] = thisColMeta;

  }

  // STEP 5: shift up if any y < 0
  const allYs = Object.values(positions).map(p=>p.y);
  const mY = Math.min(...allYs);
  if(mY < 0) Object.values(positions).forEach(p=> p.y += -mY);

  // strip phantoms
  Object.keys(positions).forEach(id=>{
    if(id.startsWith('_phantom_')) delete positions[id];
  });

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