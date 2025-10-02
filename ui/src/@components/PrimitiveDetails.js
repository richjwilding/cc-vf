import React, { useEffect, useMemo, useReducer, useRef } from 'react'
import { PrimitiveCard } from '../PrimitiveCard'
import PrimitiveConfig from '../PrimitiveConfig'
import MainStore from '../MainStore'

const mainstore = MainStore()

const getValueFromSource = (source, key) => {
  if (!key?.includes?.('.')) {
    return source?.[key]
  }
  const parts = key.split('.')
  const last = parts.pop()
  let node = source
  for (const part of parts) {
    if (!node) {
      return undefined
    }
    node = node[part]
  }
  return node?.[last]
}

const passesCondition = (primitive, item) => {
  if (!item.condition) {
    return true
  }

  return Object.entries(item.condition).every(([field, expected]) => {
    if (typeof expected !== 'string') {
      return primitive.referenceParameters?.[field] === expected
    }
    let invert = false
    let value = expected
    if (expected.startsWith('!')) {
      invert = true
      value = expected.slice(1)
    }
    const matches = primitive.referenceParameters?.[field] === value
    return invert ? !matches : matches
  })
}

const fieldsBeingProcessed = (primitive) => {
  const checkSection = (section) => {
    if (!section || !(section instanceof Object)) {
      return []
    }
    const temp = Object.values(section).filter((entry) => {
      if (entry && entry.targetFields) {
        if (entry.started) {
          if (new Date() - new Date(entry.started) > 5 * 60 * 1000) {
            return false
          }
        }
        return true
      }
      return false
    })
    return temp.reduce((acc, entry) => acc.concat(entry.targetFields), [])
  }

  if (primitive && primitive.processing) {
    return [checkSection(primitive.processing.ai), checkSection(primitive.processing)].flat()
  }
  return []
}

const GRID_COLUMN_CLASSES = {
  1: 'grid grid-cols-1 gap-4',
  2: 'grid grid-cols-1 gap-4 md:grid-cols-2',
  3: 'grid grid-cols-1 gap-4 md:grid-cols-3',
  4: 'grid grid-cols-1 gap-4 md:grid-cols-4',
}

const COLUMN_START_CLASSES = {
  1: 'md:col-start-1',
  2: 'md:col-start-2',
  3: 'md:col-start-3',
  4: 'md:col-start-4',
}

const COLUMN_SPAN_CLASSES = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
}

const ROW_START_CLASSES = {
  1: 'md:row-start-1',
  2: 'md:row-start-2',
  3: 'md:row-start-3',
  4: 'md:row-start-4',
  5: 'md:row-start-5',
  6: 'md:row-start-6',
}

const ROW_SPAN_CLASSES = {
  1: 'md:row-span-1',
  2: 'md:row-span-2',
  3: 'md:row-span-3',
  4: 'md:row-span-4',
  5: 'md:row-span-5',
  6: 'md:row-span-6',
}

const getGridColumnsClass = (columnCount) => {
  const clamped = Math.min(Math.max(columnCount, 1), 4)
  return GRID_COLUMN_CLASSES[clamped]
}

const getColumnStartClass = (column) => COLUMN_START_CLASSES[Math.min(Math.max(column, 1), 4)]

const getColumnSpanClass = (span) => COLUMN_SPAN_CLASSES[Math.min(Math.max(span, 1), 4)]

const getRowStartClass = (row) => ROW_START_CLASSES[Math.min(Math.max(row, 1), 6)]

const getRowSpanClass = (span) => ROW_SPAN_CLASSES[Math.min(Math.max(span, 1), 6)]

const buildLayout = (items) => {
  const blocksByPosition = new Map()
  const trailing = []
  let maxColumn = 0

  for (const item of items) {
    const layout = item.layout
    if (!layout || typeof layout !== 'string') {
      trailing.push(item)
      continue
    }
    const [colRaw, rowRaw] = layout.split('_')
    const column = parseInt(colRaw, 10)
    const row = parseInt(rowRaw, 10)
    if (!Number.isFinite(column) || !Number.isFinite(row)) {
      trailing.push(item)
      continue
    }

    const spanValue = parseInt(item.layoutSpan ?? item.layout_span, 10)
    const span = Number.isFinite(spanValue) && spanValue > 0 ? spanValue : 1
    const rowSpanValue = parseInt(item.layoutRowSpan ?? item.layout_row_span, 10)
    const rowSpan = Number.isFinite(rowSpanValue) && rowSpanValue > 0 ? rowSpanValue : 1
    const directionRaw = (item.layoutDirection ?? item.layout_direction ?? 'vertical').toString().toLowerCase()
    const direction = directionRaw === 'horizontal' ? 'horizontal' : 'vertical'

    const key = `${column}_${row}`
    if (!blocksByPosition.has(key)) {
      blocksByPosition.set(key, {
        column,
        row,
        span: 1,
        rowSpan: 1,
        direction,
        items: [],
      })
    }

    const block = blocksByPosition.get(key)
    block.items.push(item)
    if (span > block.span) {
      block.span = span
    }
    if (rowSpan > block.rowSpan) {
      block.rowSpan = rowSpan
    }
    if (direction === 'horizontal') {
      block.direction = 'horizontal'
    }

    const blockEnd = block.column + block.span - 1
    if (blockEnd > maxColumn) {
      maxColumn = blockEnd
    }
  }

  const blocks = Array.from(blocksByPosition.values()).sort((a, b) => {
    if (a.row === b.row) {
      return a.column - b.column
    }
    return a.row - b.row
  })

  if (blocks.length > 0 && maxColumn === 0) {
    maxColumn = Math.max(...blocks.map((block) => block.column + block.span - 1))
  }

  return { blocks, trailing, columnCount: maxColumn }
}

const PrimitiveDetails = ({
  primitive,
  editing = false,
  fullList = false,
  activeParameters,
  fields,
  hidden,
  showExtra = false,
  noEvents = false,
  className,
  items,
}) => {
  const [version, bumpVersion] = useReducer((value) => value + 1, 0)
  const callbackId = useRef(null)

  useEffect(() => {
    if (noEvents) {
      return undefined
    }
    callbackId.current = mainstore.registerCallback(
      callbackId.current,
      'parameter_update set_parameter',
      bumpVersion,
      primitive.id
    )
    return () => {
      mainstore.deregisterCallback(callbackId.current)
    }
  }, [noEvents, primitive.id])

  const parameters = activeParameters ?? primitive.metadata?.parameters ?? PrimitiveConfig.metadata?.[primitive.type]?.parameters

  const source = primitive.referenceParameters

  const detailItems = useMemo(() => {
    if (!parameters) {
      return []
    }

    let orderedKeys = Object.keys(parameters).sort(
      (a, b) => (parameters[a].order ?? 99) - (parameters[b].order ?? 99)
    )

    const typeOverrides = new Map()
    if (fields) {
      const fieldList = Array.isArray(fields) ? fields : [fields]
      const allowed = new Set()

      fieldList.forEach((entry) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          Object.entries(entry).forEach(([key, type]) => {
            allowed.add(key)
            typeOverrides.set(key, type)
          })
        } else if (typeof entry === 'string') {
          allowed.add(entry)
        }
      })

      if (allowed.size > 0) {
        orderedKeys = orderedKeys.filter((key) => allowed.has(key))
      }
    }

    if (primitive.metadata?.autoParam) {
      orderedKeys = orderedKeys
        .concat(Object.keys(source ?? {}))
        .filter((key, index, array) => array.indexOf(key) === index)
    }

    if (hidden) {
      const hiddenList = Array.isArray(hidden) ? hidden : [hidden]
      orderedKeys = orderedKeys.filter((key) => !hiddenList.includes(key))
    }

    const detailList = orderedKeys
      .filter((key) => !parameters[key]?.hidden)
      .map((key) => {
        const config = parameters[key]
        if (!config) {
          const value = source?.[key]
          return {
            type: 'string',
            title: `${key} (auto)`,
            value,
            key,
          }
        }
        const overrideType = typeOverrides.get(key)
        const effectiveConfig = overrideType
          ? { ...config, type: overrideType }
          : config
        let value = getValueFromSource(source, key)
        if (value === undefined && effectiveConfig.default !== undefined) {
          value = effectiveConfig.default
        }
        return {
          ...effectiveConfig,
          value,
          autoId: source?.[`${key}Id`],
          key,
        }
      })
      .filter((item) => passesCondition(primitive, item))

    const includeEmpty = editing || fullList

    const filtered = detailList.filter((item) => {
      if (includeEmpty) {
        if (!showExtra && item.extra && (item.value === undefined || item.value === null)) {
          return false
        }
        return true
      }
      if (item.value === undefined || item.value === null || item.value === '') {
        return item.default !== undefined || item.type === 'primitive_parent'
      }
      return true
    })

    return filtered
  }, [parameters, primitive, source, fields, hidden, editing, fullList, showExtra, version])

  if (!parameters || detailItems.length === 0) {
    return null
  }

  const pendingFields = fieldsBeingProcessed(primitive)
  const { blocks, trailing, columnCount } = buildLayout(detailItems)
  const gridClass = getGridColumnsClass(columnCount > 0 ? columnCount : 1)

  const renderField = (item) => {
    const isPending = pendingFields?.includes?.(`referenceParameters.${item.key}`)
    return isPending ? (
          <div className="h-10 w-full animate-pulse rounded-medium bg-default-200" />
        ) : (
          <PrimitiveCard.RenderItem
            primitive={primitive}
            item={item}
            items={items}
            editing={editing}
            editable={editing}
            compact
            title={item.title}
          />
        )
  }

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {blocks.length > 0 && (
        <div className={gridClass}>
          {blocks.map((block) => (
            <div
              key={`${block.column}-${block.row}`}
              className={[
                block.direction === 'horizontal'
                  ? 'flex flex-row flex-wrap gap-4'
                  : 'flex flex-col gap-3',
                'col-span-1',
                getColumnStartClass(block.column),
                getColumnSpanClass(block.span),
                'row-span-1',
                getRowStartClass(block.row),
                getRowSpanClass(block.rowSpan),
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {block.items.map((item) => (
                <React.Fragment key={item.key}>{renderField(item)}</React.Fragment>
              ))}
            </div>
          ))}
        </div>
      )}
      {trailing.length > 0 && (
        <div className="flex flex-col gap-4">
          {trailing.map((item) => (
            <React.Fragment key={`trailing-${item.key}`}>
              {renderField(item)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

export default PrimitiveDetails
