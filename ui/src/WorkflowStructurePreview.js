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
import AnimatedKonvaProgressBar from "./AnimatedKonvaProgressBar";


import { instance } from "@viz-js/viz";
import PrimitiveConfig from "./PrimitiveConfig";
import { useRunningAnimation } from "./@components/RunningAnimation";
import { useVizInstance } from "./@components/useVizInstance";


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
  "error": {base: "#fee2e2", highlight: "#ef4444"},
  "rerun": {base: "#fee2e2", highlight: "#ef4444"},
  "error_skip": {base: "#fbbf24", highlight: "#fef9c3"}
}

export default function WorkflowStructurePreview({ statusMap, ...props }) {
  // 1) Build `nodes` and `edges` arrays from statusMap
  const [showHidden, setShowHidden] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const [groupByLabels, setGroupByLabels] = useState(true)

  const stageRef = useRef()
  const layerRef = useRef()
  const offsetRef = useRef(0);
  const [update, setUpdate] = useState({})
  const [ready, setReady] = useState(false)
  const vizRef = useVizInstance();


  const { nodes, edges, visibleIds } = useMemo(() => {
    const {nodes, edges, visibleIds} = PrimitiveConfig.flowInstanceStatusToMap( statusMap, {showHidden, showSkipped, groupByLabels})
    return {nodes: nodes.map(d=>({...d, width: NODE_WIDTH, height: NODE_HEIGHT})), edges, visibleIds}
      
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
       newState[p.id] = true
      }
     doUpdate(newState)
    }
  })

  // 2) Compute x/y positions for each node using a simple tree layout
  const positions = useMemo(() => {
    console.log(`rerun pos ${vizRef}`)
    if( vizRef ){

      let maxX = 0, maxY = 0
      const pos = computeTreeLayout(vizRef, nodes, edges, NODE_WIDTH * 1, NODE_HEIGHT * 1, (positions)=>{
        for(const p of Object.values(positions)){
          if( p.x > maxX ){maxX = p.x + NODE_WIDTH}
          if( p.y > maxY ){maxY = p.y + NODE_HEIGHT}
        }
        setReady({maxX, maxY})
      });
      return pos
    }
  }, [vizRef, nodes, edges]);

  useRunningAnimation(layerRef, offsetRef);

  if(!ready){
    return <></>
  }

  return (
    <AutoSizer enableResizeObserver={true}>
        {({ width, height }) => {
            const scale = Math.min(1, width / ready.maxX * 0.95, height / ready.maxY * 0.95 ) 
            const ox = ((width - (ready.maxX * scale)) / 2) / scale
            const oy = ((height - (ready.maxY * scale)) / 2) / scale
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
                    let renderedIcon
                    let hasIcon = false
                    if( icon ){
                      renderedIcon = convertIconForKonva( <HeroIcon icon={icon} className="w-5 h-5"/>, {width: 28, height: 28}).icon
                      hasIcon = true
                    }
                    //const nodeColor = (!anyRunning && candidateForRun) ? {base: "#f3e8ff", highlight: "#c084fc"} : (colorMap[status] ?? {base: "#f2f2f2", highlight:"#333"})
                    const nodeColor = (colorMap[status] ?? {base: "#f2f2f2", highlight:"#333"})
                    return (
                      <Group
                        key={id}
                        x={x}
                        y={y}
                        update={update[id] ?? 0}
                        id={id}
                        opacity={skipped ? 0.5 : undefined}
                        onClick={() =>{
                          if(props.onClick){
                            props.onClick(nodes.find(d=>d.id === id)?.itemIds)
                          }
                        }}
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
function computeTreeLayout(viz, nodes, edges, hSpacing = 200, vSpacing = 100, ready) {
  let positions = {};
  for(const node of nodes){
    positions[node.id] = {x:0,y:0}
  }
   let cancelled = false;
  (async () => {
    function graphToDot({ nodes, edges }) {
      const midNodes = []
      const maxNodes = []
      for( const d of nodes ){
        if( !edges.find(e=>e.from === d.id) ){
          maxNodes.push(d)
        }else{
          midNodes.push(d)
        }
      }
      const nodeLines = nodes.map(n => `${JSON.stringify(n.id)} [width=${NODE_WIDTH / 72}, height=${NODE_HEIGHT / 72} fixedsize=1 ]`).join(";\n");
      const edgeLines = edges
        .map(e => `${JSON.stringify(e.from)} -> ${JSON.stringify(e.to)}`)
        .join(";\n");
      return `digraph G {
      rankdir=LR;
      ranksep=1;
      nodesep=1;
      ${nodeLines}
      ${edgeLines}
      {
        rank = max
        ${maxNodes.map(d=>JSON.stringify(d.id)).join("\n")}
      }
      }`;
    }
  
    // 2. Define your DOT graph
    const dotSource = graphToDot({nodes, edges})
  
    try {
      if( nodes.length > 0){

        const layout = viz.renderJSON(dotSource);
        if (cancelled) return;
        
        for(const node of layout.objects){
          if(node.pos){
            const [x,y]= node.pos.split(",")
            positions[node.name] = {x: parseFloat(x), y: parseFloat(y)}
          }
        }
        ready(positions)
      }      
    } catch (err) {
      console.error("Graphviz layout error:", err);
    }
  })();

   computeTreeLayout.cancel = () => { cancelled = true; };

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