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


    function buildBoard(){
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
    }

    const renderedSet = useMemo(() => {
        return buildBoard()
    }, [primitive?.id]);

    useEffect(()=>{
        const update = buildBoard()[0]
        if( update && canvasRef.current){
            canvasRef.current.refreshFrame( primitive.id, update)
        }
    },[primitive?.renderConfig?.theme, refreshKey])

    const pinEntries = useMemo(() => {
        if (!primitive) {
            return [];
        }
        const pins = primitive.inputPins ?? {};
        return Object.entries(pins);
    }, [primitive?.id, refreshKey]);

    const pinStatus = primitive?.inputPinsWithStatus ?? {};
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
        return { constrainTo: primitive.origin?.id };
    }, [primitive?.id]);


    const pageHasRender = renderedSet.length > 0;

    return (
        <div className="flex h-full min-h-0 w-full space-x-4 bg-gray-50 p-4">
            {chatDocked && (
                <div className="flex h-full w-1/4 min-w-[24rem] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                    {false && <div className="flex h-full flex-col overflow-hidden p-3 text-sm"></div>}

                    <div className={clsx([
                                        'flex h-full flex-col overflow-hidden p-3 text-sm w-full',
                                        agentStatus.hasReplies ? "h-full " : "pt-[30vh]",
                                    ])}>

                        {!agentStatus.hasReplies && (
                            <div className="mb-8 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-slate-600 w-[60%] mx-auto">
                                Ask Sense AI for help with configuring this page or interpreting its data.
                            </div>
                        )}
                        <div className="flex min-h-0 flex-col overflow-hidden h-full">
                            <AgentChat
                                primitive={primitive}
                                context={primitive}
                                showContext={false}
                                scope={agentScope}
                                setStatus={setAgentStatus}
                                seperateInput={true}
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-row space-x-4 overflow-hidden">
                        <div className="flex h-full w-[28rem] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-600">Data inputs</p>
                                <p className="text-xs text-slate-500">Provide values to personalize this page.</p>
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
                                <FilterHierarchy root={primitive.importsHierarchyAnnotated} page={primitive} />
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
                </div>
            </div>
        </div>
    );
}
