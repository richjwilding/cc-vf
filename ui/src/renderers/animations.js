import Konva from "konva"

const THEME_PHASE_CONFIG = {
    bars: {
        columnOffsets: [-3, -1, 1, 3],
        offsetScale: 1,
        wrapOffsets: true,
        rowSlope: 0.4,
    },
    area: {
        columnOffsets: [-4, -2, 1, 4],
        offsetScale: 1,
        wrapOffsets: true,
        rowSlope: -0.5,
    },
    pie: {
        columnOffsets: [-2.5, -1, 0.5, 2.2],
        offsetScale: 1,
        wrapOffsets: true,
        rowSlope: 0.12,
    },
}

const DEFAULT_PHASE_CONFIG = {
    columnOffsets: [0],
    offsetScale: 1,
    wrapOffsets: true,
    rowSlope: 0,
}

const DEG_TO_RAD = Math.PI / 180
const MIN_RENDER_SCALE = 1e-4

const GLOBAL_ANIMATION_BASE_TICK = 0

export function createProcessingPlaceholder(size = 120, options = {}){
    const resolvedSize = Math.max(32, Number.isFinite(size) ? size : 120)
    const requestedCount = Number(options.squareCount ?? options.tileCount ?? options.cubeCount ?? 256)
    const squareCount = Number.isFinite(requestedCount)
        ? Math.max(64, Math.min(640, Math.round(requestedCount)))
        : 256

    const group = new Konva.Group({
        x: 0,
        y: 0,
        width: resolvedSize,
        height: resolvedSize,
        listening: false,
    })

    const backgroundFill = typeof options.backgroundFill === "string" ? options.backgroundFill : "#ffffff"
    const backgroundOpacity = clampBetween(options.backgroundOpacity ?? 1, 0, 1)

    const chartKeys = ["bars", "area", "pie", "table", "textbox"]
    const chartKeySeeds = chartKeys.reduce((acc, key, index) => {
        const seed = key.split("").reduce((value, ch) => value + ch.charCodeAt(0), 0) + (index + 1) * 17
        acc[key] = seed
        return acc
    }, {})

    const grid = buildPlaceholderGrid(squareCount)
    const padding = resolvedSize * 0.14
    const bounds = {
        left: padding,
        top: padding,
        right: resolvedSize - padding,
        bottom: resolvedSize - padding,
    }
    bounds.width = bounds.right - bounds.left
    bounds.height = bounds.bottom - bounds.top

    const tileSlot = Math.max(2, Math.min(bounds.width / (grid.columns + 1), bounds.height / (grid.rows + 1)))
    const tileSize = Math.max(1.2, tileSlot * 0.56)
    const halfTile = tileSize / 2
    const tileStroke = Math.max(0.45, tileSize * 0.16)
    const tileCorner = Math.min(tileSize * 0.25, 4)

    const chartContext = {
        size: resolvedSize,
        bounds,
        tileSlot,
        tileSize,
        halfTile,
        leftLimit: bounds.left + halfTile,
        rightLimit: bounds.right - halfTile,
        topLimit: bounds.top + halfTile,
        bottomLimit: bounds.bottom - halfTile,
        centerX: resolvedSize / 2,
        centerY: resolvedSize / 2,
        bars: [0.58, 0.84, 0.68],
        areaCurve: [
            { x: 0, y: 0.16 },
            { x: 0.18, y: 0.42 },
            { x: 0.32, y: 0.26 },
            { x: 0.48, y: 0.68 },
            { x: 0.66, y: 0.18 },
            { x: 0.82, y: 0.86 },
            { x: 1, y: 0.12 },
        ],
        minAreaHeight: 0.18,
        pieSegments: [375,375,250],
    }
    chartContext.tileCorner = tileCorner

    const maxRadius = Math.min(bounds.width, bounds.height) / 2 - halfTile * 1.1
    chartContext.outerRadius = Math.max(halfTile * 3, maxRadius)
    chartContext.innerRadius = 0

    const usableWidth = chartContext.rightLimit - chartContext.leftLimit
    const usableHeight = chartContext.bottomLimit - chartContext.topLimit
    const gridColumns = Math.max(1, grid.columns)
    const gridRows = Math.max(1, grid.rows)
    const gridSpacingX = gridColumns > 1 ? usableWidth / (gridColumns - 1) : 0
    const gridSpacingY = gridRows > 1 ? usableHeight / (gridRows - 1) : 0

    chartContext.lastChartKey = undefined
    chartContext.gridColumns = gridColumns
    chartContext.gridRows = gridRows
    chartContext.gridSpacingX = gridSpacingX
    chartContext.gridSpacingY = gridSpacingY
    chartContext.gridXPositions = Array.from({ length: gridColumns }, (_, col) => chartContext.leftLimit + col * gridSpacingX)
    chartContext.gridYPositions = Array.from({ length: gridRows }, (_, row) => chartContext.topLimit + row * gridSpacingY)
    const gridCenterColumn = Math.floor((gridColumns - 1) / 2)
    const gridCenterRow = Math.floor((gridRows - 1) / 2)
    chartContext.gridCenterX = chartContext.gridXPositions[gridCenterColumn] ?? chartContext.centerX
    chartContext.gridCenterY = chartContext.gridYPositions[gridCenterRow] ?? chartContext.centerY
    chartContext.maxPieRadius = Math.min(
        chartContext.outerRadius,
        chartContext.tileSlot * Math.max(4, Math.min(gridColumns, gridRows) * 0.45),
    )
    const totalTiles = grid.points.length
    const permutations = {}
    chartKeys.forEach(key => {
        const baseSeed = chartKeySeeds[key] ?? 17
        permutations[key] = buildSwapPermutation(totalTiles, baseSeed)
    })
    chartContext.permutations = permutations

    const tiles = grid.points.map((point, id) => {
        const chartTargets = {}

        chartKeys.forEach(key => {
            const permutation = chartContext.permutations?.[key]
            const permutedIndex = Array.isArray(permutation) && permutation.length > point.index
                ? permutation[point.index]
                : point.index
            const effectiveColumnRaw = permutedIndex % chartContext.gridColumns
            const effectiveRowRaw = Math.floor(permutedIndex / chartContext.gridColumns)
            const target = computePlaceholderTargetForChart(
                key,
                point,
                chartContext,
                effectiveColumnRaw,
                effectiveRowRaw,
            )
            const baseLightness = clampBetween(target.baseLightness ?? 52, 10, 90)
            const baseSeed = (point.index + 1) * (chartKeySeeds[key] + 23)
            const seeds = Array.from({ length: 12 }, (_, idx) => placeholderSeed(baseSeed, idx + 1))
            const motion = derivePlaceholderMotion(key, point, target, chartContext, seeds[0], seeds[1], seeds[2], seeds[3], seeds[4], seeds[5])
            const scaleInStart = 0.7 + seeds[6] * 0.24
            const scaleInEnd = 0.96 + seeds[7] * 0.08
            const scaleOutEnd = 0.58 + seeds[8] * 0.2
            const pauseScaleBase = scaleInEnd * (0.95 + seeds[9] * 0.06)
            const pauseScaleAmp = 0.03 + seeds[10] * 0.03
            const pauseTilt = (seeds[11] - 0.5) * 6
            const phaseTargets = computeThemePhaseTargets(key, target, chartContext)
            const stableOpacity = clampBetween(target.stableOpacity ?? (target.active === false ? 0 : 0.94), 0, 1)

            chartTargets[key] = {
                id,
                x: target.x,
                y: target.y,
                targetX: target.x,
                targetY: target.y,
                baseLightness,
                stableOpacity,
                orderHint: target.orderHint,
                sweepOrder: target.sweepOrder,
                normalizedX: target.normalizedX,
                normalizedY: target.normalizedY,
                baseStrokeWidth: tileStroke,
                introOffsetX: motion.introOffsetX,
                introOffsetY: motion.introOffsetY,
                introRotation: motion.introRotation,
                exitOffsetX: motion.exitOffsetX,
                exitOffsetY: motion.exitOffsetY,
                exitRotation: motion.exitRotation,
                scaleInStart,
                scaleInEnd,
                scaleOutEnd,
                pauseScaleBase,
                pauseScaleAmp,
                pauseTilt,
                pausePhaseOffset: seeds[0],
                transitionTilt: motion.transitionTilt,
                rank: target.rank ?? 0,
                rankNormalized: target.rankNormalized ?? 0,
                phaseTargetsX: phaseTargets.x,
                phaseTargetsY: phaseTargets.y,
                phaseCount: phaseTargets.count,
                active: target.active !== false,
                segmentIndex: target.segmentIndex ?? 0,
                filled: target.filled === true,
                fillLightness: typeof target.fillLightness === "number" ? target.fillLightness : undefined,
                tableRole: target.tableRole,
                textLine: target.textLine,
            }
        })

        return {
            index: point.index,
            chartTargets,
            baseStrokeWidth: tileStroke,
            renderState: {
                x: chartContext.centerX,
                y: chartContext.centerY,
                opacity: 0,
                scale: 1,
                rotation: 0,
                strokeStyle: "",
                fillStyle: null,
                fillEnabled: false,
            },
            __strokeKey: null,
            __fillKey: null,
        }
    })

    const chartStats = {}
    chartKeys.forEach(key => {
        const activeEntries = tiles
            .map(tile => ({ tile, data: tile.chartTargets[key] }))
            .filter(entry => entry.data && entry.data.active !== false)
            .sort((a, b) => (a.data.sweepOrder ?? 0) - (b.data.sweepOrder ?? 0))

        activeEntries.forEach((entry, idx) => {
            entry.data.rank = idx
            entry.data.rankNormalized = activeEntries.length > 1 ? idx / (activeEntries.length - 1) : 0
        })

        chartStats[key] = {
            activeCount: activeEntries.length > 0 ? activeEntries.length : 1,
        }
    })

    const animationOptions = options.animationConfig || {}
    const animationConfig = {
        chartOrder: Array.isArray(animationOptions.chartOrder) && animationOptions.chartOrder.length > 0
            ? [...animationOptions.chartOrder]
            : [...chartKeys],
        transitionDuration: Math.max(1, animationOptions.transitionDuration ?? 600),
        pauseDuration: Math.max(1, animationOptions.pauseDuration ?? 5000),
        minFrameInterval: Math.max(1, animationOptions.minFrameInterval ?? 33),
        hueCycleMs: Math.max(1, animationOptions.hueCycleMs ?? 35),
        pauseFrameInterval: Math.max(1, animationOptions.pauseFrameInterval ?? 50),
    }

    const placeholder = {
        group,
        tiles,
        chartKeys,
        chartStats,
        tileSlot,
        size: resolvedSize,
        squareCount,
        context: chartContext,
        backgroundFill,
        backgroundOpacity,
        tilePath: buildTilePath(tileSize, tileCorner),
    }

    placeholder.animationId = resolvePlaceholderAnimationId(options)

    const tilesShape = new Konva.Shape({
        x: 0,
        y: 0,
        width: resolvedSize,
        height: resolvedSize,
        listening: false,
        perfectDrawEnabled: false,
        sceneFunc: (ctx, shape) => {
            const container = shape.__placeholder
            if (!container) {
                return
            }
            renderPlaceholderScene(ctx, container)
        },
    })
    tilesShape.__placeholder = placeholder
    placeholder.tilesShape = tilesShape
    group.add(tilesShape)

    placeholder.animation = {
        config: animationConfig,
        state: {
            lastTick: null,
        },
    }

    return placeholder
}

export function updateProcessingPlaceholder(placeholder, options = {}) {
    if (!placeholder || !placeholder.tiles || placeholder.tiles.length === 0) {
        return
    }

    const {
        chartKey: requestedChartKey,
        stage = "pause",
        stageProgress: rawStageProgress = 0,
        shimmerProgress: rawShimmerProgress = 0,
        hue = 0,
    } = options

    const stageProgress = clampBetween(rawStageProgress, 0, 1)
    const shimmerProgress = clampBetween(rawShimmerProgress, 0, 1)

    const context = placeholder.context || {}
    const availableChartKeys = placeholder.chartKeys || []
    const fallbackKey = requestedChartKey || context.lastChartKey || availableChartKeys[0]

    const transitionState = placeholder.__transitionState || {
        currentKey: fallbackKey,
        targetKey: null,
        sourceKey: null,
        mode: "stable",
        progress: 0,
    }

    if (!transitionState.currentKey) {
        transitionState.currentKey = fallbackKey
    }

    const normalizedRequest = requestedChartKey || transitionState.targetKey || transitionState.currentKey

    if (normalizedRequest && normalizedRequest !== transitionState.currentKey) {
        if (transitionState.targetKey !== normalizedRequest) {
            transitionState.sourceKey = transitionState.currentKey
            transitionState.targetKey = normalizedRequest
        }
    } else if (!transitionState.targetKey) {
        transitionState.sourceKey = transitionState.currentKey
    }

    let effectiveStage = stage
    if (transitionState.targetKey && effectiveStage !== "transition") {
        effectiveStage = "transition"
    }

    if (effectiveStage === "transition" && (transitionState.targetKey == null || transitionState.sourceKey == null)) {
        transitionState.sourceKey = transitionState.currentKey
        transitionState.targetKey = normalizedRequest || transitionState.currentKey
    }

    const stageBlend = effectiveStage === "transition" ? easeInOutCubic(stageProgress) : easeOutCubic(stageProgress)

    let activeSourceKey = transitionState.sourceKey || transitionState.currentKey || fallbackKey
    let activeTargetKey = transitionState.targetKey || transitionState.currentKey || fallbackKey

    if (!activeSourceKey) {
        activeSourceKey = activeTargetKey
    }
    if (!activeTargetKey) {
        activeTargetKey = activeSourceKey
    }

    const transitionComplete = effectiveStage === "transition" && stageBlend >= 1 - 1e-3

    let needsRedraw = true
    const normalizedHue = Math.round(normalizeHue(hue) / 2 ) * 2
    const strokeStyleCache = placeholder.__strokeStyleCache || (placeholder.__strokeStyleCache = new Map())
    const fillStyleCache = placeholder.__fillStyleCache || (placeholder.__fillStyleCache = new Map())
    strokeStyleCache.clear()
    fillStyleCache.clear()

    placeholder.tiles.forEach(tile => {
        const renderState = tile.renderState
        if (!renderState) {
            return
        }

        const sourceTarget = tile.chartTargets?.[activeSourceKey]
        const targetTarget = tile.chartTargets?.[activeTargetKey]

        const hasSource = Boolean(sourceTarget && sourceTarget.active !== false)
        const hasTarget = Boolean(targetTarget && targetTarget.active !== false)

        let desiredX = targetTarget?.x ?? sourceTarget?.x ?? context.centerX ?? 0
        let desiredY = targetTarget?.y ?? sourceTarget?.y ?? context.centerY ?? 0
        let desiredScale = targetTarget?.pauseScaleBase ?? 1
        let desiredOpacity = targetTarget?.stableOpacity ?? 0
        let desiredRotation = 0

        if (effectiveStage === "transition") {
            const entering = !hasSource && hasTarget
            const exiting = hasSource && !hasTarget

            const startX = entering
                ? (targetTarget?.x ?? desiredX) + (targetTarget?.introOffsetX ?? 0)
                : sourceTarget?.x ?? desiredX
            const startY = entering
                ? (targetTarget?.y ?? desiredY) + (targetTarget?.introOffsetY ?? 0)
                : sourceTarget?.y ?? desiredY

            const endX = exiting
                ? (sourceTarget?.x ?? desiredX) + (sourceTarget?.exitOffsetX ?? 0)
                : targetTarget?.x ?? desiredX
            const endY = exiting
                ? (sourceTarget?.y ?? desiredY) + (sourceTarget?.exitOffsetY ?? 0)
                : targetTarget?.y ?? desiredY

            desiredX = lerp(startX, endX, stageBlend)
            desiredY = lerp(startY, endY, stageBlend)

            const startScale = entering
                ? targetTarget?.scaleInStart ?? 0.6
                : sourceTarget?.scaleInEnd ?? 1
            const endScale = exiting
                ? sourceTarget?.scaleOutEnd ?? 0.4
                : targetTarget?.scaleInEnd ?? 1
            desiredScale = lerp(startScale, endScale, stageBlend)

            const startOpacity = entering
                ? (targetTarget?.stableOpacity ?? 0) * 0.1
                : sourceTarget?.stableOpacity ?? 0
            const endOpacity = exiting
                ? (sourceTarget?.stableOpacity ?? 0) * 0.05
                : targetTarget?.stableOpacity ?? 0
            desiredOpacity = lerp(startOpacity, endOpacity, stageBlend)

            desiredRotation = lerp(sourceTarget?.transitionTilt ?? 0, targetTarget?.transitionTilt ?? 0, stageBlend)
        } else {
            desiredX = targetTarget?.x ?? sourceTarget?.x ?? desiredX
            desiredY = targetTarget?.y ?? sourceTarget?.y ?? desiredY

            const pulse = Math.sin((shimmerProgress + (targetTarget?.pausePhaseOffset ?? 0)) * Math.PI * 2)
            desiredScale = (targetTarget?.pauseScaleBase ?? 1) + (targetTarget?.pauseScaleAmp ?? 0.02) * pulse
            desiredOpacity = targetTarget?.stableOpacity ?? 0
            desiredRotation = (targetTarget?.pauseTilt ?? 0) * pulse
        }

        desiredOpacity = clampBetween(desiredOpacity, 0, 1)

        renderState.x = desiredX
        renderState.y = desiredY
        renderState.scale = ensureMinimumScale(desiredScale)
        renderState.opacity = desiredOpacity
        
        const q = 0.5
        renderState.rotation = Math.round(desiredRotation / q) * q;

        renderState.rotation = desiredRotation * DEG_TO_RAD
        renderState.strokeWidth = tile.baseStrokeWidth

        const _tone = targetTarget?.baseLightness ?? sourceTarget?.baseLightness ?? 60
        const tone = Math.round(_tone / 2) * 2;
        const strokeAlpha = desiredOpacity
        if (strokeAlpha > 0.001) {
            const strokeKey = `${normalizedHue}|${tone.toFixed(2)}|${strokeAlpha.toFixed(3)}`
            if (tile.__strokeKey !== strokeKey) {
                let strokeStyle = strokeStyleCache.get(strokeKey)
                if (!strokeStyle) {
                    strokeStyle = `hsla(${normalizedHue}, 72%, ${tone}%, ${strokeAlpha})`
                    strokeStyleCache.set(strokeKey, strokeStyle)
                }
                renderState.strokeStyle = strokeStyle
                tile.__strokeKey = strokeKey
            }
        } else {
            renderState.strokeStyle = null
            tile.__strokeKey = null
        }

        const sourceFilled = Boolean(sourceTarget?.filled)
        const targetFilled = Boolean(targetTarget?.filled)
        const sourceFillLightness = sourceTarget ? computeFillLightness(sourceTarget) : undefined
        const targetFillLightness = targetTarget ? computeFillLightness(targetTarget) : undefined

        let fillAlpha = 0
        let fillLightness = targetFillLightness ?? sourceFillLightness ?? (tone - 14)

        if (effectiveStage === "transition") {
            const startAlpha = sourceFilled ? 1 : 0
            const endAlpha = targetFilled ? 1 : 0
            fillAlpha = lerp(startAlpha, endAlpha, stageBlend)
            const startLightness = sourceFillLightness ?? fillLightness
            const endLightness = targetFillLightness ?? fillLightness
            fillLightness = lerp(startLightness, endLightness, stageBlend)
        } else {
            if (targetTarget && targetFilled) {
                fillAlpha = 1
                fillLightness = targetFillLightness ?? fillLightness
            } else if (sourceTarget && sourceFilled && !transitionState.targetKey) {
                fillAlpha = 1
                fillLightness = sourceFillLightness ?? fillLightness
            } else {
                fillAlpha = 0
            }
        }

        fillAlpha = clampBetween(fillAlpha, 0, 1)

        const finalFillAlpha = fillAlpha * desiredOpacity

        if (finalFillAlpha > 0.02) {
            const limitedLightness = Math.round(clampBetween(fillLightness, 10, 90) / 2) * 2
            const fillKey = `${normalizedHue}|${limitedLightness.toFixed(2)}|${finalFillAlpha.toFixed(3)}`
            if (tile.__fillKey !== fillKey) {
                let fillStyle = fillStyleCache.get(fillKey)
                if (!fillStyle) {
                    fillStyle = `hsla(${normalizedHue}, 78%, ${limitedLightness}%, ${finalFillAlpha})`
                    fillStyleCache.set(fillKey, fillStyle)
                }
                renderState.fillStyle = fillStyle
                tile.__fillKey = fillKey
            }
            renderState.fillEnabled = true
        } else {
            if (renderState.fillEnabled) {
                tile.__fillKey = null
            }
            renderState.fillEnabled = false
            renderState.fillStyle = null
        }

    })

    if (needsRedraw) {
        const shape = placeholder.tilesShape
        const layer = shape?.getLayer?.()
        if (layer && layer.batchDraw) {
            layer.batchDraw()
        } else if (shape && shape.requestDraw) {
            shape.requestDraw()
        }
    }

    if (transitionComplete && transitionState.targetKey) {
        transitionState.currentKey = transitionState.targetKey
        transitionState.sourceKey = transitionState.targetKey
        transitionState.targetKey = null
    }

    transitionState.mode = effectiveStage
    transitionState.progress = stageBlend
    placeholder.__transitionState = transitionState
    context.lastChartKey = transitionState.currentKey
}

export function configureProcessingPlaceholderAnimation(placeholder, config = {}) {
    if (!placeholder) {
        return
    }
    const animation = placeholder.animation || (placeholder.animation = { config: {}, state: {} })
    const baseConfig = animation.config || {}
    const state = animation.state || (animation.state = {})

    const shouldInvalidateTiming = config.reset === true
        || config.chartOrder != null
        || config.transitionDuration != null
        || config.pauseDuration != null

    if (shouldInvalidateTiming) {
        invalidatePlaceholderAnimationTiming(state)
    }

    if (Array.isArray(config.chartOrder) && config.chartOrder.length > 0) {
        baseConfig.chartOrder = [...config.chartOrder]
    } else if (!Array.isArray(baseConfig.chartOrder) || baseConfig.chartOrder.length === 0) {
        baseConfig.chartOrder = [...(placeholder.chartKeys || [])]
    }

    if (config.transitionDuration != null) {
        baseConfig.transitionDuration = Math.max(1, config.transitionDuration)
    }
    if (config.pauseDuration != null) {
        baseConfig.pauseDuration = Math.max(1, config.pauseDuration)
    }
    if (config.minFrameInterval != null) {
        baseConfig.minFrameInterval = Math.max(1, config.minFrameInterval)
    }
    if (config.hueCycleMs != null) {
        baseConfig.hueCycleMs = Math.max(1, config.hueCycleMs)
    }
    if (config.pauseFrameInterval != null) {
        baseConfig.pauseFrameInterval = Math.max(1, config.pauseFrameInterval)
    }

    if (state.lastTick == null) {
        state.lastTick = null
    }

    baseConfig.transitionDuration = Math.max(1, baseConfig.transitionDuration ?? 600)
    baseConfig.pauseDuration = Math.max(1, baseConfig.pauseDuration ?? 5000)
    baseConfig.minFrameInterval = Math.max(1, baseConfig.minFrameInterval ?? 33)
    baseConfig.hueCycleMs = Math.max(1, baseConfig.hueCycleMs ?? 35)
    baseConfig.pauseFrameInterval = Math.max(1, baseConfig.pauseFrameInterval ?? 99)
}

export function tickProcessingPlaceholder(placeholder, tick) {
    if (!placeholder || typeof tick !== "number" || Number.isNaN(tick)) {
        return false
    }

    const animation = placeholder.animation
    if (!animation) {
        return false
    }

    const config = animation.config || {}
    const state = animation.state || (animation.state = {})

    const chartOrder = Array.isArray(config.chartOrder) && config.chartOrder.length > 0
        ? config.chartOrder
        : (placeholder.chartKeys || [])

    if (!chartOrder.length) {
        return false
    }

    const minFrameInterval = Math.max(1, config.minFrameInterval ?? 33)
    const pauseFrameInterval = Math.max(minFrameInterval, config.pauseFrameInterval ?? 99)

    const lastTick = state.lastTick
    const elapsedSinceLast = lastTick != null ? tick - lastTick : Number.POSITIVE_INFINITY
    if (lastTick != null && elapsedSinceLast < minFrameInterval) {
        return false
    }

    const transitionDuration = Math.max(1, config.transitionDuration ?? 600)
    const pauseDuration = Math.max(1, config.pauseDuration ?? 5000)
    const chartDuration = transitionDuration + pauseDuration
    const totalCycle = chartDuration * chartOrder.length

    const cycleLength = totalCycle > 0 ? totalCycle : Math.max(1, chartDuration)

    if (state.cycleLength !== cycleLength) {
        state.cycleLength = cycleLength
        state.offsetKey = null
        state.offsetMs = null
    }

    const offsetKeySeed = placeholder.animationId ?? "default"
    const offsetKey = `${offsetKeySeed}|${cycleLength}`
    if (state.offsetKey !== offsetKey) {
        state.offsetKey = offsetKey
        state.offsetMs = computePlaceholderAnimationOffset(placeholder, cycleLength)
    }

    const offsetMs = state.offsetMs ?? 0

    const elapsed = Math.max(0, tick + offsetMs)
    const cycleTime = totalCycle > 0 ? elapsed % totalCycle : 0
    const chartIndex = totalCycle > 0 ? Math.floor(cycleTime / chartDuration) : 0
    const chartKey = chartOrder[chartIndex] ?? chartOrder[0]
    const chartElapsed = cycleTime - chartIndex * chartDuration

    let stage = "transition"
    let stageElapsed = chartElapsed

    if (chartElapsed >= transitionDuration) {
        stage = "pause"
        stageElapsed = chartElapsed - transitionDuration
    }

    const stageDuration = stage === "transition" ? transitionDuration : pauseDuration
    let stageProgress = stageDuration > 0 ? stageElapsed / stageDuration : 1

    stageProgress = clampBetween(stageProgress, 0, 1)
    const shimmerProgress = stage === "pause" ? stageProgress : 0

    const hueCycleMs = Math.max(1, config.hueCycleMs ?? 35)
    const hue = ((tick / hueCycleMs) % 360 + 360) % 360

    if (stage === "pause" && elapsedSinceLast < pauseFrameInterval) {
        return false
    }

    const lastFrame = state.lastFrame
    if (lastFrame && lastFrame.chartKey === chartKey && lastFrame.stage === stage) {
        const deltaStage = Math.abs(stageProgress - lastFrame.stageProgress)
        const deltaHue = Math.abs(hue - lastFrame.hue)
        const deltaShimmer = Math.abs(shimmerProgress - lastFrame.shimmerProgress)
        if (deltaStage < 0.01 && deltaHue < 1 && deltaShimmer < 0.01) {
            state.lastTick = tick
            return true
        }
    }

    state.lastTick = tick

    updateProcessingPlaceholder(placeholder, {
        chartKey,
        stage,
        stageProgress,
        shimmerProgress,
        hue,
    })

    state.lastFrame = {
        chartKey,
        stage,
        stageProgress,
        shimmerProgress,
        hue,
    }

    return true
}

function buildSwapPermutation(count, seedBase) {
    const size = Math.max(1, count)
    const permutation = Array.from({ length: size }, (_, idx) => idx)
    const swapIterations = Math.max(4, Math.min(size, Math.floor(size * 0.3)))
    let salt = 1

    for (let i = 0; i < swapIterations; i += 1) {
        const indexA = Math.floor(placeholderSeed(seedBase, salt++) * size)
        let indexB = Math.floor(placeholderSeed(seedBase, salt++) * size)
        if (indexA === indexB) {
            indexB = (indexB + 1) % size
        }
        const temp = permutation[indexA]
        permutation[indexA] = permutation[indexB]
        permutation[indexB] = temp
    }

    return permutation
}

function buildTableBoundaries(totalSlots, segments) {
    if (!Number.isFinite(totalSlots) || totalSlots <= 0 || !Number.isFinite(segments) || segments <= 0) {
        return [0, Math.max(0, totalSlots - 1)]
    }

    const boundaries = []
    for (let i = 0; i <= segments; i += 1) {
        const boundary = Math.round((totalSlots - 1) * (i / segments))
        if (!boundaries.includes(boundary)) {
            boundaries.push(boundary)
        }
    }
    boundaries.sort((a, b) => a - b)
    return boundaries
}

function boundarySetContains(boundaries, value) {
    if (!Array.isArray(boundaries)) {
        return false
    }
    for (let i = 0; i < boundaries.length; i += 1) {
        if (boundaries[i] === value) {
            return true
        }
    }
    return false
}

function computePlaceholderTargetForChart(chartKey, point, context, effectiveColumn, effectiveRow) {
    const safeColumn = clampBetween(
        Number.isFinite(effectiveColumn) ? effectiveColumn : point.column,
        0,
        Math.max(0, context.gridColumns - 1),
    )
    const safeRow = clampBetween(
        Number.isFinite(effectiveRow) ? effectiveRow : point.row,
        0,
        Math.max(0, context.gridRows - 1),
    )

    const baseX = context.gridXPositions?.[safeColumn] ?? context.centerX ?? 0
    const baseY = context.gridYPositions?.[safeRow] ?? context.centerY ?? 0
    const normalizedX = context.gridColumns > 1 ? safeColumn / (context.gridColumns - 1) : 0
    const normalizedY = context.gridRows > 1 ? safeRow / (context.gridRows - 1) : 0
    const chartHeight = (context.bottomLimit ?? 0) - (context.topLimit ?? 0)

    const baseTarget = {
        x: baseX,
        y: baseY,
        orderHint: point.index,
        sweepOrder: normalizedX + normalizedY * 0.1,
        normalizedX,
        normalizedY,
        baseLightness: clampBetween(56 - normalizedY * 14, 36, 72),
        stableOpacity: 0.92,
        active: true,
        filled: false,
    }

    if (chartKey === "bars") {
        const bars = context.bars || [0.6, 0.8, 0.65]
        const barCount = Math.max(1, bars.length)
        const barWidth = context.gridColumns / barCount
        const barBoundaries = context.bars.map((_, i) => Math.floor(barWidth * i))
        const barPosition = barCount > 1 ? Math.min(barCount - 1, Math.floor(normalizedX * barCount)) : 0
        const barRatio = bars[Math.min(barCount - 1, barPosition)]
        const barX = baseX
        const cutoffY = (context.bottomLimit ?? baseY) - barRatio * chartHeight
        const isActive = baseY >= cutoffY - context.tileSlot * 0.6 && (safeColumn !== barBoundaries[barPosition])
        const verticalBias = (normalizedX - 0.5) * context.tileSlot * 0.35
        const barLightness = clampBetween(58 - barPosition * 8 + (1 - normalizedY) * 8, 32, 72)
        const fillLightness = clampBetween(barLightness - 16, 26, 72)

        return {
            ...baseTarget,
            x: barX,
            y: clampBetween(isActive ? baseY + verticalBias : cutoffY, context.topLimit, context.bottomLimit),
            stableOpacity: isActive ? 0.94 : 0,
            baseLightness: barLightness,
            sweepOrder: barPosition + (1 - normalizedY) * 0.6,
            active: isActive,
            filled: isActive && (barPosition % 2 === 0),
            barIndex: barPosition,
            fillLightness,
        }
    }

    if (chartKey === "area") {
        const curve = context.areaCurve || [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]
        const areaHeight = clampBetween(sampleAreaHeight(curve, normalizedX), context.minAreaHeight ?? 0.15, 0.98)
        const cutoffY = (context.bottomLimit ?? baseY) - areaHeight * chartHeight
        const isActive = baseY >= cutoffY - context.tileSlot * 0.5
        const slopeBias = (normalizedX - 0.5) * context.tileSlot * 0.55

        return {
            ...baseTarget,
            x: clampBetween(baseX + slopeBias * 0.35, context.leftLimit, context.rightLimit),
            y: clampBetween(isActive ? baseY : cutoffY, context.topLimit, context.bottomLimit),
            stableOpacity: isActive ? 0.9 : 0,
            baseLightness: clampBetween(60 - normalizedY * 26 + areaHeight * 18, 34, 76),
            sweepOrder: normalizedX + areaHeight * 0.8,
            active: isActive,
        }
    }

    if (chartKey === "pie") {
        const segments = context.pieSegments && context.pieSegments.length > 0 ? context.pieSegments : [1]
        const total = segments.reduce((sum, seg) => sum + seg, 0)
        const centerX = context.gridCenterX ?? context.centerX ?? baseX
        const centerY = context.gridCenterY ?? context.centerY ?? baseY
        const computedInner = Math.max(context.innerRadius ?? 0, 0)
        const computedOuter = Math.max(context.outerRadius ?? (computedInner + context.tileSlot * 6), computedInner + context.tileSlot * 2)
        const innerRadius = computedInner
        const outerRadius = computedOuter
        const dx = baseX - centerX
        const dy = baseY - centerY
        const distance = Math.sqrt(dx * dx + dy * dy)
        const tileAngle = normalizeAngle(Math.atan2(dy, dx))
        const circleRadius = Math.max(
            innerRadius + context.tileSlot,
            Math.min(context.maxPieRadius ?? outerRadius, outerRadius - context.tileSlot * 0.4),
        )
        const radialSlack = context.tileSlot * 0.45

        if (distance > circleRadius + radialSlack || distance === 0) {
            return {
                ...baseTarget,
                active: false,
                stableOpacity: 0,
                baseLightness: 46,
            }
        }

        const twoPi = Math.PI * 2
        const angleUnit = tileAngle / twoPi
        let segmentIndex = segments.length - 1
        let segmentStartValue = total - segments[segments.length - 1]
        let cumulative = 0
        for (let i = 0; i < segments.length; i += 1) {
            const next = cumulative + segments[i]
            if (angleUnit <= next / total + 1e-6) {
                segmentIndex = i
                segmentStartValue = cumulative
                break
            }
            cumulative = next
        }

        const segmentValue = segments[segmentIndex] || segments[segments.length - 1] || 1
        const segmentStartAngle = (segmentStartValue / total) * twoPi
        const segmentEndAngle = ((segmentStartValue + segmentValue) / total) * twoPi
        const segmentSpan = Math.max(segmentEndAngle - segmentStartAngle, 1e-6)
        let relativeAngle = tileAngle - segmentStartAngle
        if (relativeAngle < 0) {
            relativeAngle += twoPi
        }
        if (relativeAngle > segmentSpan) {
            relativeAngle = segmentSpan
        }
        const segmentProgress = relativeAngle / segmentSpan

        let accumulated = 0
        let isBoundary = false
        if (segments.length > 1) {
            for (let i = 0; i < segments.length - 1; i += 1) {
                accumulated += segments[i]
                const boundaryAngle = normalizeAngle((accumulated / total) * Math.PI * 2)
                const delta = Math.abs(normalizeAngleDifference(tileAngle, boundaryAngle))
                const boundaryThreshold = 0.06
                if (delta < boundaryThreshold && distance <= circleRadius - (1.5 * radialSlack)) {
                    isBoundary = true
                    break
                }
            }
        }

        if (isBoundary || (segmentIndex === segments.length - 1 && distance <= circleRadius - (1.5 * radialSlack))) {
            return {
                ...baseTarget,
                active: false,
                stableOpacity: 0,
                baseLightness: 48,
            }
        }

        const normalizedRadius = clampBetween(distance / Math.max(circleRadius, 1), 0, 1)
        const segmentBlend = segments.length > 1 ? segmentIndex / (segments.length - 1) : 0
        const segmentToneBase = 58 + segmentBlend * 30
        const radialTone = -normalizedRadius * 14
        const angularTone = (segmentProgress - 0.5) * 8
        const baseLightness = clampBetween(segmentToneBase + radialTone + angularTone, 42, 80)

        return {
            ...baseTarget,
            stableOpacity: 0.95,
            baseLightness,
            sweepOrder: distance,
            active: true,
            segmentIndex,
            filled: segmentIndex === 0,
            fillLightness: segmentIndex === 0 ? clampBetween(baseLightness - 12, 24, 74) : undefined,
        }
    }

    if (chartKey === "table") {
        const cols = 3
        const rows = 5

        if (context.gridColumns < cols + 1 || context.gridRows < rows + 1) {
            return {
                ...baseTarget,
                active: false,
                stableOpacity: 0,
            }
        }

        const columnBoundaries = context.__tableColumnBoundaries || buildTableBoundaries(context.gridColumns, cols)
        const rowBoundaries = context.__tableRowBoundaries || buildTableBoundaries(context.gridRows, rows)
        context.__tableColumnBoundaries = columnBoundaries
        context.__tableRowBoundaries = rowBoundaries

        const minColumn = columnBoundaries[0]
        const maxColumn = columnBoundaries[columnBoundaries.length - 1]
        const minRow = rowBoundaries[0]
        const maxRow = rowBoundaries[rowBoundaries.length - 1]

        if (safeColumn < minColumn || safeColumn > maxColumn || safeRow < minRow || safeRow > maxRow) {
            return {
                ...baseTarget,
                active: false,
                stableOpacity: 0,
                baseLightness: 46,
            }
        }

        const onVerticalBorder = boundarySetContains(columnBoundaries, safeColumn)
        const onHorizontalBorder = boundarySetContains(rowBoundaries, safeRow)

        const columnStride = (context.gridColumns - 1) / cols
        const rowStride = (context.gridRows - 1) / rows
        const columnIndex = Math.min(cols - 1, Math.max(0, Math.floor((safeColumn - minColumn + 0.0001) / Math.max(columnStride, 1))))
        const rowIndex = Math.min(rows - 1, Math.max(0, Math.floor((safeRow - minRow + 0.0001) / Math.max(rowStride, 1))))
        const isHeader = rowIndex === 0

        const role = (onVerticalBorder || onHorizontalBorder) ? "border" : (isHeader ? "header" : "cell")
        const filled = role === "header"
        const stableOpacity = filled ? 0.96 : role === "cell" ? 0.85 : 0
        const fillLightness = filled ? clampBetween(baseTarget.baseLightness - 14, 24, 72) : undefined

        return {
            ...baseTarget,
            stableOpacity,
            baseLightness: role === "border" ? clampBetween(baseTarget.baseLightness + 6, 40, 76) : baseTarget.baseLightness,
            sweepOrder: rowIndex * cols + columnIndex,
            active: role !== "border",
            filled,
            fillLightness,
            tableRole: role,
        }
    }

    if (chartKey === "textbox") {
        const boxLeft = 0
        const boxRight = 1
        const boxTop = 0
        const boxBottom = 1
        const boxWidth = boxRight - boxLeft
        const boxHeight = boxBottom - boxTop

        if (normalizedX < boxLeft - 0.05 || normalizedX > boxRight + 0.05 || normalizedY < boxTop - 0.05 || normalizedY > boxBottom + 0.05) {
            return {
                ...baseTarget,
                active: false,
                stableOpacity: 0,
                baseLightness: 44,
            }
        }

        const relX = clampBetween((normalizedX - boxLeft) / boxWidth, 0, 1)
        const relY = clampBetween((normalizedY - boxTop) / boxHeight, 0, 1)

        const outlineThickness = 0.05
        const nearLeft = relX <= outlineThickness
        const nearRight = relX >= 1 - outlineThickness
        const nearTop = relY <= outlineThickness
        const nearBottom = relY >= 1 - outlineThickness
        const nearOutline = nearLeft || nearRight || nearTop || nearBottom

        const lineHeights = 4
        const lineThickness = 0.08
        const lineSpacing = 1 / (lineHeights + 1)
        const lineLengths = [0.92, 0.8, 0.6, 0.78]

        let matchedLine = -1
        for (let i = 0; i < lineHeights; i += 1) {
            const center = (i + 1) * lineSpacing
            if (Math.abs(relY - center) <= lineThickness * 0.5 && relX <= lineLengths[i]) {
                matchedLine = i
                break
            }
        }

        if (!nearOutline && matchedLine === -1) {
            return {
                ...baseTarget,
                active: false,
                stableOpacity: 0,
                baseLightness: 46,
            }
        }

        const filled = matchedLine >= 0 && !nearOutline
        const fillLightness = filled ? clampBetween(baseTarget.baseLightness - 18, 24, 70) : undefined
        const stableOpacity = filled ? 0.95 : 0.92

        return {
            ...baseTarget,
            stableOpacity,
            baseLightness: clampBetween(baseTarget.baseLightness + (nearOutline ? 6 : -2), 38, 76),
            active: true,
            filled,
            fillLightness,
            textLine: matchedLine,
        }
    }

    return baseTarget
}


function computeThemePhaseTargets(themeKey, target, context) {
    const config = THEME_PHASE_CONFIG[themeKey] || DEFAULT_PHASE_CONFIG
    const offsets = Array.isArray(config.columnOffsets) && config.columnOffsets.length > 0
        ? config.columnOffsets
        : [0]
    const xTargets = []
    const yTargets = []
    offsets.forEach(offset => {
        const x = clampBetween(
            target.x + offset * context.tileSlot * config.offsetScale,
            context.leftLimit,
            context.rightLimit,
        )
        const y = clampBetween(
            target.y + offset * config.rowSlope * context.tileSlot,
            context.topLimit,
            context.bottomLimit,
        )
        xTargets.push(x)
        yTargets.push(y)
    })
    return {
        x: xTargets,
        y: yTargets,
        count: xTargets.length,
    }
}

function derivePlaceholderMotion(chartKey, point, target, context, a, b, c, d, e, f) {
    const slot = context.tileSlot ?? 6
    const introSpread = slot * (chartKey === "pie" ? 6 : 4)
    const exitSpread = slot * (chartKey === "pie" ? 4.5 : 3.5)
    return {
        introOffsetX: (a - 0.5) * introSpread,
        introOffsetY: (b - 0.5) * introSpread,
        introRotation: (c - 0.5) * 18,
        exitOffsetX: (d - 0.5) * exitSpread,
        exitOffsetY: (e - 0.5) * exitSpread,
        exitRotation: (f - 0.5) * 14,
        transitionTilt: ((a + b) - 1) * 6,
    }
}

function sampleAreaHeight(curve, t) {
    if (!Array.isArray(curve) || curve.length === 0) {
        return 0
    }
    const clamped = clampBetween(t, 0, 1)
    for (let i = 0; i < curve.length - 1; i += 1) {
        const start = curve[i]
        const end = curve[i + 1]
        if (clamped < end.x) {
            const span = end.x - start.x
            const weight = span === 0 ? 0 : clampBetween((clamped - start.x) / span, 0, 1)
            return lerp(start.y, end.y, weight)
        }
    }
    const lastPoint = curve[curve.length - 1]
    return typeof lastPoint.y === "number" ? lastPoint.y : 0
}

function placeholderSeed(seed, salt = 1) {
    let value = (seed ^ (salt * 0x9e3779b1)) >>> 0
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
    value ^= value >>> 16
    return (value >>> 8) / 0x01000000
}

function buildPlaceholderGrid(count) {
    const safeCount = Math.max(1, Math.floor(count))
    const columns = Math.max(4, Math.ceil(Math.sqrt(safeCount)))
    const rows = Math.max(4, Math.ceil(safeCount / columns))
    const points = []

    for (let index = 0; index < safeCount; index += 1) {
        const column = index % columns
        const row = Math.floor(index / columns)
        const normalizedColumn = columns > 1 ? column / (columns - 1) : 0.5
        const normalizedRow = rows > 1 ? row / (rows - 1) : 0.5
        const normalizedIndex = safeCount > 1 ? index / (safeCount - 1) : 0
        points.push({
            index,
            column,
            row,
            normalizedColumn,
            normalizedRow,
            normalizedIndex,
        })
    }

    return {
        columns,
        rows,
        points,
    }
}

function clampBetween(value, min, max) {
    if (Number.isNaN(value)) {
        return min
    }
    if (value < min) {
        return min
    }
    if (value > max) {
        return max
    }
    return value
}

function lerp(a, b, t) {
    return a + (b - a) * t
}

function easeInOutCubic(t) {
    const clamped = clampBetween(t, 0, 1)
    return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

function easeOutCubic(t) {
    const clamped = clampBetween(t, 0, 1)
    return 1 - Math.pow(1 - clamped, 3)
}

function computeFillLightness(target) {
    if (!target) {
        return undefined
    }
    if (typeof target.fillLightness === "number") {
        return target.fillLightness
    }
    const base = typeof target.baseLightness === "number" ? target.baseLightness : 60
    const adjustment = target.segmentIndex === 0 ? -18 : -14
    return clampBetween(base + adjustment, 18, 82)
}

function normalizeAngle(angle) {
    const twoPi = Math.PI * 2
    let result = angle % twoPi
    if (result < 0) {
        result += twoPi
    }
    return result
}

function normalizeAngleDifference(a, b) {
    const twoPi = Math.PI * 2
    let delta = (a - b) % twoPi
    if (delta > Math.PI) {
        delta -= twoPi
    } else if (delta < -Math.PI) {
        delta += twoPi
    }
    return delta
}

function resolvePlaceholderAnimationId(options = {}) {
    if (!options || typeof options !== "object") {
        return null
    }
    const candidates = [
        options.animationId,
        options.placeholderId,
        options.animationKey,
        options.id,
    ]
    for (let i = 0; i < candidates.length; i += 1) {
        const value = candidates[i]
        if (value === 0 || value) {
            return String(value)
        }
    }
    return null
}

function computePlaceholderAnimationOffset(placeholder, cycleLength) {
    if (!placeholder || !Number.isFinite(cycleLength) || cycleLength <= 0) {
        return 0
    }
    const identifier = placeholder.animationId
        ?? placeholder.group?.attrs?.id
        ?? "default"
    const fallbackSeed = (placeholder.squareCount ?? 0) + (placeholder.context?.size ?? 0)
    const numericSeed = hashIdentifierToSeed(identifier, fallbackSeed)
    const sample = placeholderSeed(numericSeed, 137)
    return sample * cycleLength
}

function hashIdentifierToSeed(identifier, fallback = 0) {
    if (typeof identifier === "number" && Number.isFinite(identifier)) {
        const value = identifier >= 0 ? identifier : -identifier
        return (Math.floor(value) >>> 0) || (fallback >>> 0)
    }
    const text = String(identifier ?? "")
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    }
    if (hash === 0) {
        hash = (Math.floor(fallback) >>> 0) || 1
    }
    return hash >>> 0
}

function invalidatePlaceholderAnimationTiming(state) {
    if (!state) {
        return
    }
    state.lastTick = null
    state.lastFrame = null
    state.cycleLength = undefined
    state.offsetKey = null
    state.offsetMs = null
}

function normalizeHue(rawHue) {
    if (!Number.isFinite(rawHue)) {
        return 0
    }
    const rounded = Math.round(rawHue)
    const normalized = rounded % 360
    return normalized < 0 ? normalized + 360 : normalized
}

function ensureMinimumScale(scale) {
    if (!Number.isFinite(scale)) {
        return 1
    }
    if (scale >= 0 && scale < MIN_RENDER_SCALE) {
        return MIN_RENDER_SCALE
    }
    if (scale < 0 && scale > -MIN_RENDER_SCALE) {
        return -MIN_RENDER_SCALE
    }
    return scale
}

function buildTilePath(tileSize, corner) {
    if (!Number.isFinite(tileSize) || tileSize <= 0) {
        return null
    }
    const safeCorner = clampBetween(typeof corner === "number" ? corner : 0, 0, tileSize / 2)
    const half = tileSize / 2
    const r = safeCorner
    const path = new Path2D()
    if (r <= 0.0001) {
        path.rect(-half, -half, tileSize, tileSize)
        return path
    }

    const left = -half
    const top = -half
    const right = half
    const bottom = half
    path.moveTo(left + r, top)
    path.lineTo(right - r, top)
    path.quadraticCurveTo(right, top, right, top + r)
    path.lineTo(right, bottom - r)
    path.quadraticCurveTo(right, bottom, right - r, bottom)
    path.lineTo(left + r, bottom)
    path.quadraticCurveTo(left, bottom, left, bottom - r)
    path.lineTo(left, top + r)
    path.quadraticCurveTo(left, top, left + r, top)
    path.closePath()
    return path
}

function renderPlaceholderScene(ctx, placeholder) {
    const { backgroundFill, backgroundOpacity, tiles, context } = placeholder;
    const size = placeholder.size ?? context?.size ?? 0;

    const base = ctx._context.getTransform
        ? ctx._context.getTransform()   // if browser API available
        : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

    ctx.save()
    ctx.globalAlpha = 1;

    if (size > 0) {
        ctx.fillStyle = backgroundFill;
        ctx.fillRect(0, 0, size, size);
    }

    ctx.globalAlpha = 1; // we'll encode alpha in styles

    ctx.setTransform(base);

    const ba = base.a, bb = base.b, bc = base.c, bd = base.d, be = base.e, bf = base.f;

    const baseScale = Math.max(1e-4, Math.hypot(ba, bb)); // ≈ stage/layer scale

    let tilePath = placeholder.tilePath;
    if (!tilePath) {
        tilePath = buildTilePath(context?.tileSize ?? 0, context?.tileCorner ?? 0);
        placeholder.tilePath = tilePath;
        if (!tilePath) return;
    }

    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const s = t.renderState;
        if (!s || s.opacity <= 0.002) continue;

        const sc = s.scale ?? 1;
        const cos = Math.cos(s.rotation) * sc;
        const sin = Math.sin(s.rotation) * sc;

        // C = base * T  (single multiply, expanded inline — fastest)
        // T = [cos sin -sin cos x y]
        const ca = ba * cos + bc * sin;
        const cb = bb * cos + bd * sin;
        const cc = ba * (-sin) + bc * cos;
        const cd = bb * (-sin) + bd * cos;
        const ce = ba * s.x + bc * s.y + be;
        const cf = bb * s.x + bd * s.y + bf;

        ctx.setTransform(ca, cb, cc, cd, ce, cf);

        if (s.fillEnabled && s.fillStyle) {
            ctx.fillStyle = s.fillStyle;     // hsla with alpha baked in
            ctx.fill(tilePath);
        }

        if (s.strokeStyle && (s.strokeWidth ?? t.baseStrokeWidth) > 0) {
            ctx.strokeStyle = s.strokeStyle; // hsla with alpha baked in
            const localScale = Math.max(1e-4, Math.abs(sc));
            ctx.lineWidth = (s.strokeWidth ?? t.baseStrokeWidth) / (baseScale * localScale);
            ctx.stroke(tilePath);
        }
    }

    ctx.restore()
}
