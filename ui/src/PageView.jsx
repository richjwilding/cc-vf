import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@heroui/react";
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";

import InfiniteCanvas from "./InfiniteCanvas";
import BoardViewer from "./BoardViewer";
import { themes } from "./RenderHelpers";
import MainStore, { uniquePrimitives } from "./MainStore";
import PrimitiveConfig from "./PrimitiveConfig";
import AgentChat from "./AgentChat";
import useDataEvent from "./CustomHook";
import { DescriptionDetails, DescriptionList, DescriptionTerm } from "./@components/description-list";
import { PrimitiveCard } from "./PrimitiveCard";
import FilterHierarchy from "./FilterHierarchy";
import FunnelHierarchy from "./FunnelHierarchy";

export default function PageView({ primitive }) {
    const mainstore = MainStore();
    const canvasRef = useRef();
    const boardStateRef = useRef({});
    const [refreshKey, triggerRefresh] = useReducer((x) => x + 1, 0);
    const [chatDocked, setChatDocked] = useState(true);
    const [agentStatus, setAgentStatus] = useState({});

    const watchIds = useMemo(() => {
        if (!primitive) {
            return [];
        }
        const descendantIds = primitive.primitives?.uniqueAllIds ?? [];
        return [primitive.id, descendantIds].flat();
    }, [primitive?.id, primitive?.primitives?.uniqueAllIds]);

    useDataEvent(
        "relationship_update set_field set_parameter set_title new_child delete_primitive",
        watchIds,
        () => {
            triggerRefresh();
            return false;
        }
    );

    useEffect(() => {
        boardStateRef.current = {};
    }, [primitive?.id]);

    const renderedSet = useMemo(() => {
        if (!primitive) {
            return [];
        }

        const state = boardStateRef.current;
        state.renderSubPages = true;
        state.showSlideSuggestions = true
        state.hideWidgets = true;
        state[primitive.id] = state[primitive.id] ?? { id: primitive.id, renderSubPages: true };

        const themeKey = primitive.renderConfig?.theme ?? primitive.configParent?.renderConfig?.theme ?? "default";
        const theme = themes[themeKey] || themes.default;

        BoardViewer.prepareBoard(primitive, state);
        const view = BoardViewer.renderBoardView(primitive, primitive, state, { theme });
        return view ? [view] : [];
    }, [primitive?.id, primitive?.renderConfig?.theme, refreshKey]);

    const pinEntries = useMemo(() => {
        if (!primitive) {
            return [];
        }
        const pins = primitive.inputPins ?? {};
        return Object.entries(pins);
    }, [primitive?.id, refreshKey]);

    const pinStatus = primitive?.inputPinsWithStatus ?? {};
    const [viewMode, setViewMode] = useState('tree')

    const selectItems = (...args) => {
        mainstore.sidebarSelect(...args);
    };

    const callbacks = useMemo(() => {
        return {
            onClick: {
                column_header: (id, pageId, data, kG) => {
                    const colIdx = id[0]?.split("_")[1];
                    if (colIdx === undefined) {
                        return;
                    }
                    const view = kG.original?.parent?.findAncestor(".view");
                    if (!view) {
                        return;
                    }
                    const stateData = view.stateData?.[view.id()];
                    const dataset = stateData?.data;
                    if (!dataset) {
                        return;
                    }
                    const list = uniquePrimitives(
                        dataset.cells
                            .filter((cell) => cell.cIdx === colIdx)
                            .flatMap((cell) => cell.items)
                    );
                    if (list.length > 0) {
                        selectItems(stateData.primitive, { forFlow: true, asList: true, list });
                    }
                },
                row_header: (id, pageId, data, kG) => {
                    const rowIdx = id[0]?.split("_")[1];
                    if (rowIdx === undefined) {
                        return;
                    }
                    const view = kG.original?.parent?.findAncestor(".view");
                    if (!view) {
                        return;
                    }
                    const stateData = view.stateData?.[view.id()];
                    const dataset = stateData?.data;
                    if (!dataset) {
                        return;
                    }
                    const list = uniquePrimitives(
                        dataset.cells
                            .filter((cell) => cell.rIdx === rowIdx)
                            .flatMap((cell) => cell.items)
                    );
                    if (list.length > 0) {
                        selectItems(stateData.primitive, { forFlow: true, asList: true, list });
                    }
                },
                frame: (id) => {
                    const prim = mainstore.primitive(id);
                    if (prim) {
                        selectItems(prim, { forFlow: true, asList: prim.type === "view" });
                    }
                },
                primitive: (id, pageId, data, kG) => {
                    const state = boardStateRef.current;
                    const viewState = state?.[id];
                    if (viewState?.variant && viewState?.primitive?.type === "page") {
                        viewState.variant = null;
                        BoardViewer.prepareBoard(viewState.primitive, state);
                        canvasRef.current?.refreshFrame(viewState.primitive.id);
                        return;
                    }
                    let stateData = kG.stateData?.[id];
                    let findSelection = false;
                    if (!stateData) {
                        let parent = kG.original?.parent;
                        stateData = parent?.stateData?.[parent.id()];
                        if (parent && !stateData) {
                            parent = parent.original?.parent;
                            stateData = parent?.stateData?.[parent.id()];
                            findSelection = true;
                        }
                    }
                    if (stateData?.primitive && stateData.config === "plain_object") {
                        const ids = stateData.object?.ids ? stateData.object.ids.filter(Boolean) : undefined;
                        if (ids?.length > 0) {
                            selectItems(stateData.primitive, {
                                forFlow: true,
                                asList: true,
                                list: ids.map((itemId) => mainstore.primitive(itemId))
                            });
                        } else if (stateData.object?.type === "text" || stateData.object?.type === "structured_text") {
                            selectItems(stateData.primitive, {
                                forFlow: true,
                                plainData: stateData.object?.text.join("\n")
                            });
                        }
                    } else {
                        let listData = stateData?.list ?? stateData?.primitiveList;
                        let axisData = stateData?.extents;
                        if (stateData?.axisSource) {
                            let axisSource = stateData.axisSource;
                            if (axisSource.inFlow && axisSource.configParent?.flowElement) {
                                axisSource = axisSource.configParent;
                            }
                            const axisSourceState = kG.stateData?.[axisSource.id];
                            if (axisSourceState) {
                                if (!stateData.data) {
                                    stateData = axisSourceState;
                                }
                                listData = axisSourceState.list ?? axisSourceState.primitiveList;
                                axisData = axisSourceState.extents;
                            }
                        }
                        if (listData) {
                            if (findSelection) {
                                const filtered = listData.filter((entry) => id.includes(entry.primitive?.id ?? entry.id));
                                if (filtered.length === id.length) {
                                    selectItems(id, {
                                        forFlow: true,
                                        asList: true,
                                        list: [mainstore.primitive(id)]
                                    });
                                    return;
                                }
                                listData = filtered;
                            }
                            selectItems(stateData.primitive, { forFlow: true, asList: true, list: listData, axisData });
                        } else {
                            selectItems(id, { forFlow: true });
                        }
                    }
                },
                cell: (id, pageId, data, kG) => {
                    let cell = id?.[0];
                    let frameId = kG?.original?.parent?.attrs?.id;
                    let direct = false;

                    if (kG && !kG.original) {
                        kG = kG.findAncestor(".inf_track");
                        frameId = kG.attrs.id;
                        direct = true;
                    }

                    if (cell && frameId) {
                        const [cIdx, rIdx] = cell.split("-");

                        let stateData = direct ? kG.stateData : kG.original.parent.stateData;
                        if (stateData) {
                            let sourceState = stateData[frameId];
                            let sourcePrimitive = sourceState.underlying;

                            if (sourceState.axisSource) {
                                let axisSource = sourceState.axisSource;
                                if (axisSource.inFlow && axisSource.configParent?.flowElement) {
                                    axisSource = axisSource.configParent;
                                }
                                const axisSourceState = stateData[axisSource.id];
                                sourcePrimitive = axisSourceState.underlying;
                                if (!sourceState.data) {
                                    sourceState = axisSourceState;
                                }
                            }
                            let filters;

                            if (sourceState.data) {
                                const dataset = sourceState.data;
                                const cellData = dataset.cells.find((c) => c.id === cell);

                                filters = [
                                    PrimitiveConfig.encodeExploreFilter(dataset.defs?.columns, cellData.columnIdx),
                                    PrimitiveConfig.encodeExploreFilter(dataset.defs?.rows, cellData.rowIdx)
                                ].filter(Boolean);
                            } else if (sourceState?.axis) {
                                filters = [
                                    PrimitiveConfig.encodeExploreFilter(sourceState.axis.column, sourceState.columns[cIdx]),
                                    PrimitiveConfig.encodeExploreFilter(sourceState.axis.row, sourceState.rows[rIdx])
                                ].filter(Boolean);
                            }
                            if (!sourcePrimitive && sourceState.primitiveList) {
                                selectItems(sourceState.primitive, {
                                    list: sourceState.primitiveList,
                                    forFlow: true,
                                    asList: true,
                                    filters
                                });
                            } else {
                                selectItems(sourcePrimitive, { forFlow: true, asList: true, filters });
                            }
                        }
                    }
                }
            }
        };
    }, [mainstore]);

    const agentScope = useMemo(() => {
        if (!primitive) {
            return undefined;
        }
        return { constrainTo: primitive.id };
    }, [primitive?.id]);

    const renderInputs = () => {
        if (pinEntries.length === 0) {
            return <p className="text-sm text-slate-500">This page has no configurable inputs.</p>;
        }
        // Build the imports hierarchy (annotated) for visualization
        const filterTree = mainstore.importsHierarchyAnnotated?.(undefined, primitive, mainstore)

        return (
            <DescriptionList inContainer>
                {pinEntries.map(([pinName, config]) => {
                    if (config.split) {
                        return (
                            <p key={pinName} className="@lg:col-span-2 py-2 text-xs font-semibold uppercase text-slate-400">
                                {config.title ?? ""}
                            </p>
                        );
                    }
                    const itemType = config.format
                        ?? (config.types?.includes("boolean")
                            ? "boolean"
                            : config.types?.includes("primitive")
                                ? "primitive"
                                : config.types?.includes("string_list")
                                    ? "list"
                                    : "long_string");
                    const item = {
                        type: itemType,
                        key: pinName,
                        value: primitive?.referenceParameters?.[pinName],
                        default: config.default,
                        placeholder: config.placeholder,
                        options: config.options,
                        icon: config.icon,
                        minValue: config.minValue ?? config.min,
                        maxValue: config.maxValue ?? config.max,
                        stepValue: config.stepValue ?? config.step,
                        asPercent: config.asPercent,
                        invert: config.invert
                    };
                    const status = pinStatus[pinName];
                    return (
                        <div key={pinName} className="contents">
                            <DescriptionTerm inContainer>
                                <span className="flex items-center space-x-2">
                                    <span>{config.name ?? pinName}</span>
                                    {status && (
                                        <span
                                            className={clsx(
                                                "inline-flex h-2.5 w-2.5 rounded-full",
                                                status.connected ? "bg-emerald-500" : "bg-slate-300"
                                            )}
                                            aria-hidden
                                        />
                                    )}
                                </span>
                            </DescriptionTerm>
                            <DescriptionDetails inContainer className="space-y-1">
                                <PrimitiveCard.RenderItem primitive={primitive} item={item} />
                                {config.description && (
                                    <p className="text-xs text-slate-500">{config.description}</p>
                                )}
                            </DescriptionDetails>
                        </div>
                    );
                })}
            </DescriptionList>
        );
    };

    const pageHasRender = renderedSet.length > 0;

    return (
        <div className="flex h-full min-h-0 w-full space-x-4 bg-gray-50 p-4">
            {chatDocked && (
                <div className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <p className="text-sm font-semibold text-slate-600">Sense AI</p>
                        <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            aria-label="Undock chat"
                            onClick={() => setChatDocked(false)}
                        >
                            <ArrowsPointingOutIcon className="h-5 w-5 text-slate-500" />
                        </Button>
                    </div>
                    <div className="flex h-full flex-col overflow-hidden p-3 text-sm">
                        {!agentStatus.hasReplies && (
                            <div className="mb-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-slate-600">
                                Ask Sense AI for help with configuring this page or interpreting its data.
                            </div>
                        )}
                        <div className="flex min-h-0 flex-col overflow-hidden">
                            <AgentChat
                                primitive={primitive}
                                scope={agentScope}
                                setStatus={setAgentStatus}
                                seperateInput
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="flex h-full min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Page</p>
                        <PrimitiveCard.Title primitive={primitive} major={false} />
                    </div>
                    {!chatDocked && (
                        <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            aria-label="Dock chat"
                            onClick={() => setChatDocked(true)}
                        >
                            <ArrowsPointingInIcon className="h-5 w-5 text-slate-500" />
                        </Button>
                    )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-row space-x-4 overflow-hidden">
                        <div className="flex h-full w-[28rem] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-600">Data inputs</p>
                                <p className="text-xs text-slate-500">Provide values to personalize this page.</p>
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
                                {renderInputs()}
                                <div className="mt-4 border-t border-slate-200 pt-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-600">Filter visualization</p>
                                            <p className="text-xs text-slate-500">Tree or funnel view of sources and filters.</p>
                                        </div>
                                        <div className="inline-flex rounded-md border border-slate-300 bg-white overflow-hidden">
                                            <button className={clsx('px-2 py-0.5 text-xs hover:bg-slate-50', viewMode==='tree' && 'bg-slate-100')} onClick={()=>setViewMode('tree')}>Tree</button>
                                            <button className={clsx('px-2 py-0.5 text-xs hover:bg-slate-50 border-l border-slate-300', viewMode==='funnel' && 'bg-slate-100')} onClick={()=>setViewMode('funnel')}>Funnel</button>
                                        </div>
                                    </div>
                                    {viewMode === 'funnel' ? (
                                        <FunnelHierarchy root={primitive.importsHierarchyAnnotated} />
                                    ) : (
                                        <FilterHierarchy root={primitive.importsHierarchyAnnotated} />
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            {pageHasRender ? (
                                <InfiniteCanvas
                                    ref={canvasRef}
                                    primitive={primitive}
                                    initialZoom="width"
                                    board
                                    hideWidgets
                                    background="#fdfdfd"
                                    ignoreAfterDrag={false}
                                    showPins={false}
                                    enableShapeSelection={false}
                                    enableFrameSelection
                                    events={{
                                        wheel: {
                                            passive: false
                                        }
                                    }}
                                    callbacks={callbacks}
                                    highlights={{
                                        primitive: "border",
                                        cell: "background",
                                        widget: "background"
                                    }}
                                    render={renderedSet}
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                                    This page has no content to display yet.
                                </div>
                            )}
                        </div>
                    </div>
                    {!chatDocked && (
                        <div className="flex min-h-[16rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-600">Sense AI</p>
                                <p className="text-xs text-slate-500">Chat with the assistant about this page.</p>
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 text-sm">
                                {!agentStatus.hasReplies && (
                                    <div className="mb-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-slate-600">
                                        Ask Sense AI for help with configuring this page or interpreting its data.
                                    </div>
                                )}
                                <div className="flex min-h-0 flex-col overflow-hidden">
                                    <AgentChat
                                        primitive={primitive}
                                        scope={agentScope}
                                        setStatus={setAgentStatus}
                                        seperateInput
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
