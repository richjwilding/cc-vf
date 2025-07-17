import React, { useMemo, useState } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Arrow, Label, Tag } from 'react-konva';

/**
 * @param {Object[]} props.items
 * @param {string|number}   props.items[].id
 * @param {string}          props.items[].title
 * @param {Date|string|number} props.items[].start
 * @param {Date|string|number} props.items[].end
 * @param {string|number|null} props.items[].parentId       – for nesting
 * @param {Array<string|number>} props.items[].childrenIds  – for dependency arrows
 * @param {number}          [props.width=800]
 * @param {number}          [props.rowHeight=30]
 * @param {number}          [props.indent=20]
 * @param {number}          [props.barHeight=20]
 */
export default function GanttChart({
  items,
  width = 800,
  rowHeight = 30,
  indent = 20,
  barHeight = 20,
}) {
  // 1️⃣ Parse dates, build lookup, and attach nesting-children
  const parsed = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      const start = new Date(item.start).getTime();
      const end   = new Date(item.end).getTime();
      map.set(item.id, {
        ...item,
        start,
        end,
        children: [],                 // for nesting
        childrenIds: item.childrenIds || [],
      });
    });
    // attach to parentId
    const roots = [];
    map.forEach(node => {
      if (node.parentId != null && map.has(node.parentId)) {
        map.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return { map, roots };
  }, [items]);

  // 2️⃣ Compute dependency-group colors (only for groups >1)
  const groupColorMap = useMemo(() => {
    const map = new Map();
    const roots = Array.from(parsed.map.values()).filter(n => n.parentId == null);
    roots.forEach((node, i) => {
      const hue = Math.floor((i * 360) / roots.length);
      map.set(node.id, `hsl(${hue},70%,80%)`);
    });
    parsed.map.forEach(node => {
      if (node.parentId != null && map.has(node.parentId)) {
        map.set(node.id, map.get(node.parentId));
      }
    });
    return map;
  }, [parsed]);

  // 3️⃣ DFS for depth & initial index
  const { depthMap, initialIndex } = useMemo(() => {
    const depthMap = new Map();
    const initialIndex = new Map();
    let idx = 0;
    function dfs(node, depth) {
      depthMap.set(node.id, depth);
      initialIndex.set(node.id, idx++);
      node.children.forEach(child => dfs(child, depth + 1));
    }
    parsed.roots.forEach(root => dfs(root, 0));
    return { depthMap, initialIndex };
  }, [parsed]);

  // 4️⃣ Topo-sort
  const sortedIds = useMemo(() => {
    const allIds = Array.from(parsed.map.keys());
    const indegree = new Map(allIds.map(id => [id, 0]));
    const outAdj   = new Map(allIds.map(id => [id, []]));
    parsed.map.forEach((node, id) => {
      if (node.parentId != null && parsed.map.has(node.parentId)) {
        indegree.set(id, indegree.get(id) + 1);
        outAdj.get(node.parentId).push(id);
      }
      node.childrenIds.forEach(cid => {
        if (parsed.map.has(cid)) {
          indegree.set(cid, indegree.get(cid) + 1);
          outAdj.get(id).push(cid);
        }
      });
    });
    const avail = allIds.filter(id => indegree.get(id) === 0)
      .sort((a, b) => initialIndex.get(a) - initialIndex.get(b));
    const result = [];
    while (avail.length) {
      const id = avail.shift();
      result.push(id);
      outAdj.get(id).forEach(nid => {
        indegree.set(nid, indegree.get(nid) - 1);
        if (indegree.get(nid) === 0) avail.push(nid);
      });
      avail.sort((a, b) => initialIndex.get(a) - initialIndex.get(b));
    }
    if (result.length !== allIds.length) console.warn('Cycle detected in dependencies');
    return result;
  }, [parsed, initialIndex]);

  // 5️⃣ Build sorted items & lookup
  const sortedItems = useMemo(
    () => sortedIds.map((id, row) => ({ ...parsed.map.get(id), depth: depthMap.get(id), row })),
    [sortedIds, parsed.map, depthMap]
  );
  const lookupById = useMemo(
    () => new Map(sortedItems.map(item => [item.id, item])),
    [sortedItems]
  );

  // 6️⃣ Build edges
  const edges = useMemo(
    () => sortedItems.flatMap(from =>
      from.childrenIds.map(cid => lookupById.get(cid)).filter(to => to)
        .map(to => ({ from, to }))
    ), [sortedItems, lookupById]
  );

  // 7️⃣ Compute timeline scale & nice ticks
  const { minTime, maxTime } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    sortedItems.forEach(n => { min = Math.min(min, n.start); max = Math.max(max, n.end); });
    return { minTime: min, maxTime: max };
  }, [sortedItems]);

  // function to pick a "nice" tick interval
  const pickInterval = (span, maxTicks = 5) => {
    const raw = span / maxTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const cand = [1, 2, 5, 10];
    for (let m of cand) {
      if (m * mag >= raw) return m * mag;
    }
    return cand[cand.length-1] * mag;
  };

  // generate tick times array
  const ticks = useMemo(() => {
    const span = maxTime - minTime;
    const interval = pickInterval(span);
    const startTick = Math.ceil(minTime / interval) * interval;
    const endTick = Math.floor(maxTime / interval) * interval;
    const arr = [];
    for (let t = startTick; t <= endTick; t += interval) arr.push(t);
    return arr;
  }, [minTime, maxTime]);

  const timeToX = t => ((t - minTime) / (maxTime - minTime)) * width;
  const totalHeight = sortedItems.length * rowHeight;
  const labelHeight = 20;
  const defaultColor = '#68b0ab';

  // format durations nicely
  const formatDuration = ms => {
    const sec = ms / 1000;
    if (sec < 60) return `${Math.round(sec)}s`;
    const mins = sec / 60;
    if (mins < 60) return `${Math.round(mins)}m`;
    return `${(mins/60).toFixed(1)}h`;
  };

  // tooltip state omitted for brevity
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' });
  const handleMouseEnter = (e, item) => {
    const pos = e.target.getStage().getPointerPosition();
    setTooltip({ visible: true, x: pos.x, y: pos.y, text: formatDuration(item.end - item.start) });
  };
  const handleMouseMove = e => setTooltip(prev => prev.visible ? { ...prev, x: e.target.getStage().getPointerPosition().x, y: e.target.getStage().getPointerPosition().y } : prev);
  const handleMouseLeave = () => setTooltip(prev => prev.visible ? { ...prev, visible: false } : prev);

  return (
    <Stage width={width} height={totalHeight + labelHeight}>
      <Layer>
        {/* grid lines + labels */}
        {ticks.map((t, i) => {
          const x = timeToX(t);
          return (
            <Group key={i}>
              <Line points={[x, 0, x, totalHeight]} stroke="#eee" dash={[4,4]} />
              <Text text={formatDuration(t - minTime)} x={x + 2} y={totalHeight + 2} fontSize={10} fill="#666" />
            </Group>
          );
        })}

        {/* bars and titles */}
        {sortedItems.map(item => {
          const x = timeToX(item.start);
          const w = timeToX(item.end) - x;
          const y = item.row * rowHeight + (rowHeight - barHeight) / 2;
          const fill = groupColorMap.get(item.id) || defaultColor;
          return (
            <Group key={item.id}>
              <Rect
                x={x} y={y} width={w} height={barHeight}
                fill={fill} cornerRadius={3}
                onMouseEnter={e => handleMouseEnter(e,item)}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />
              <Text text={item.title} x={item.depth*indent + 5} y={y + (barHeight-14)/2} fontSize={12} fill="#333" />
            </Group>
          );
        })}

        {/* arrows */}
        {edges.map((edge,i) => {
          const x1 = timeToX(edge.from.end);
          const y1 = edge.from.row*rowHeight + rowHeight/2;
          const x2 = timeToX(edge.to.start);
          const y2 = edge.to.row*rowHeight + rowHeight/2;
          const xm = x1 + (x2-x1)/2;
          const color = groupColorMap.get(edge.from.id) || '#444';
          return (
            <Arrow key={i} points={[x1,y1,xm,y1,xm,y2,x2,y2]} pointerLength={6} pointerWidth={6} stroke={color} fill={color} strokeWidth={1} />
          );
        })}

        {/* tooltip */}
        {tooltip.visible && (
          <Label x={tooltip.x+5} y={tooltip.y+5}>
            <Tag fill="black" pointerDirection="down" pointerWidth={6} pointerHeight={6} lineJoin="round" />
            <Text text={tooltip.text} fontSize={12} padding={4} fill="white" />
          </Label>
        )}
      </Layer>
    </Stage>
  );
}
