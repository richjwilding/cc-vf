import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import MainStore from "./MainStore";

const CANCELLABLE_STATES = new Set(["waiting", "delayed", "active", "waiting-children"]);

function formatTimestamp(value) {
    if (!value) {
        return "N/A";
    }
    try {
        const date = new Date(Number(value));
        if (Number.isNaN(date.getTime())) {
            return "N/A";
        }
        return date.toLocaleString();
    } catch {
        return "N/A";
    }
}

function JobNode({ node, onCancel, cancellingKeys, visited }) {
    if (!node) {
        return null;
    }

    if (node.missing) {
        return (
            <div className="ml-4 border-l border-slate-200 pl-4 text-xs text-red-600">
                Missing job reference {node.jobKey}
            </div>
        );
    }

    if (visited.has(node.jobKey)) {
        return (
            <div className="ml-4 border-l border-slate-200 pl-4 text-xs text-amber-600">
                Cycle detected for {node.jobKey}
            </div>
        );
    }

    const nextVisited = new Set(visited);
    nextVisited.add(node.jobKey);

    const isCancelling = cancellingKeys.has(node.jobKey);
    const canCancel =
        CANCELLABLE_STATES.has(node.status) && !node.cancellationRequested && !isCancelling;

    const label = node.primitive
        ? `${node.primitive.displayType} #${node.primitive.plainId} - ${node.primitive.title}`
        : node.primitiveId || node.jobId;
    const statusLabel = node.status ? node.status : "unknown";
    const modeLabel = node.mode ? `${node.mode}` : undefined;
    const subtitle = [statusLabel, modeLabel].filter(Boolean).join(" | ");

    return (
        <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 text-sm">
                        <div className="font-medium text-slate-800">{label}</div>
                        <div className="text-xs text-slate-500">
                            Job {node.jobId} | {node.queueType}
                        </div>
                        <div className="text-xs text-slate-600">{subtitle}</div>
                        {node.field && (
                            <div className="text-xs text-slate-500">Field: {node.field}</div>
                        )}
                        {node.cancellationRequested && (
                            <div className="text-xs text-amber-600">
                                Cancellation requested
                                {node.cancellationReason ? ` - ${node.cancellationReason}` : ""}
                            </div>
                        )}
                        {node.failedReason && (
                            <div className="text-xs text-red-600">
                                Failed: {node.failedReason}
                            </div>
                        )}
                        {node.children.length === 0 && (
                            <div className="text-xs text-slate-400">No child jobs</div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="text-xs text-slate-500">
                            Attempts: {node.attemptsMade ?? 0}
                        </div>
                        <button
                            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                            onClick={() => onCancel(node)}
                            disabled={!canCancel}
                        >
                            {isCancelling ? "Cancelling..." : "Cancel job"}
                        </button>
                    </div>
                </div>
            </div>
            {node.children.length > 0 && (
                <div className="ml-4 border-l border-slate-200 pl-4 space-y-2">
                    {node.children.map((child) => (
                        <JobNode
                            key={child.jobKey || `missing-${child.index}`}
                            node={child}
                            onCancel={onCancel}
                            cancellingKeys={cancellingKeys}
                            visited={nextVisited}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function QueuePage({ intervalSeconds = 5 }) {
    const params = useParams();
    const workspaceId = params?.workspaceId ?? params?.id;
    const store = useMemo(() => MainStore(), []);

    const [queues, setQueues] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [cancellingKeys, setCancellingKeys] = useState(() => new Set());
    const pendingRequests = useRef(0);

    useEffect(() => {
        if (workspaceId) {
            store.loadActiveWorkspace(workspaceId);
        }
    }, [workspaceId, store]);

    const buildHierarchy = useCallback(
        (statusList = []) => {
            const nodeMap = new Map();
            const childKeys = new Set();
            const queueMeta = new Map();

            for (const entry of statusList) {
                if (!entry?.queue) {
                    continue;
                }
                queueMeta.set(entry.queue, {
                    queueType: entry.queueType,
                    activeCount: entry.activeCount,
                    lastActivity: entry.lastActivity,
                });
                const jobs = entry.jobs || [];
                for (const job of jobs) {
                    const jobKey = `bull:${entry.queue}:${job.id}`;
                    const primitiveId = job.data?.id;
                    const primitive = primitiveId ? store.primitive(primitiveId) : undefined;
                    const node = {
                        jobKey,
                        jobId: job.id,
                        queueName: entry.queue,
                        queueType: job.queueType || entry.queueType || entry.queue.split("-").pop(),
                        primitiveId,
                        primitive,
                        status: job.status,
                        mode: job.data?.mode,
                        field: job.data?.field,
                        data: job.data,
                        attemptsMade: job.attemptsMade,
                        failedReason: job.failedReason,
                        childrenKeys: Object.keys(job.children || {}),
                        children: [],
                        cancellationRequested: job.data?.cancellationRequested === true,
                        cancellationReason: job.data?.cancellationReason,
                    };
                    nodeMap.set(jobKey, node);
                }
            }

            nodeMap.forEach((node) => {
                node.childrenKeys.forEach((childKey) => {
                    childKeys.add(childKey);
                });
            });

            nodeMap.forEach((node) => {
                const resolvedChildren = node.childrenKeys.map((childKey, index) => {
                    const child = nodeMap.get(childKey);
                    if (child) {
                        child.parentKey = node.jobKey;
                        return child;
                    }
                    return { jobKey: childKey, missing: true, index };
                });
                node.children = resolvedChildren;
            });

            const rootsByQueue = new Map();
            nodeMap.forEach((node, key) => {
                if (!childKeys.has(key)) {
                    const bucket = rootsByQueue.get(node.queueName) || [];
                    bucket.push(node);
                    rootsByQueue.set(node.queueName, bucket);
                }
            });

            rootsByQueue.forEach((list) => {
                list.sort((a, b) => a.jobId.localeCompare(b.jobId));
            });

            const queuesArray = [];
            queueMeta.forEach((meta, queueName) => {
                queuesArray.push({
                    queueName,
                    queueType: meta.queueType,
                    activeCount: meta.activeCount,
                    lastActivity: meta.lastActivity,
                    roots: rootsByQueue.get(queueName) || [],
                });
            });

            queuesArray.sort((a, b) => a.queueType.localeCompare(b.queueType));

            return queuesArray;
        },
        [store]
    );

    const fetchStatus = useCallback(
        async ({ signal } = {}) => {
            if (!workspaceId) {
                setQueues([]);
                return;
            }
            try {
                if (pendingRequests.current === 0) {
                    setLoading(true);
                }
                pendingRequests.current += 1;
                setError(null);
                const response = await fetch(`/api/queues/${workspaceId}/status`, {
                    method: "get",
                    signal,
                });
                const payload = await response.json();
                if (signal?.aborted) {
                    return;
                }
                if (!response.ok || payload.success !== true) {
                    throw new Error(payload.error || `Request failed (${response.status})`);
                }
                const nextQueues = buildHierarchy(payload.result || []);
                setQueues(nextQueues);
                setLastUpdated(new Date());
            } catch (err) {
                if (signal?.aborted) {
                    return;
                }
                if (err?.name === "AbortError") {
                    return;
                }
                console.error(err);
                setError(err?.message || "Unable to fetch queue status");
            } finally {
                pendingRequests.current = Math.max(0, pendingRequests.current - 1);
                if (pendingRequests.current === 0) {
                    setLoading(false);
                }
            }
        },
        [workspaceId, buildHierarchy]
    );

    useEffect(() => {
        if (!workspaceId) {
            setQueues([]);
            return;
        }

        let controllers = [];

        const run = () => {
            const controller = new AbortController();
            controllers.push(controller);
            fetchStatus({ signal: controller.signal }).finally(() => {
                controllers = controllers.filter((ctrl) => ctrl !== controller);
            });
        };

        run();

        if (intervalSeconds > 0) {
            const timer = setInterval(run, intervalSeconds * 1000);
            return () => {
                controllers.forEach((ctrl) => ctrl.abort());
                clearInterval(timer);
            };
        }

        return () => {
            controllers.forEach((ctrl) => ctrl.abort());
        };
    }, [workspaceId, intervalSeconds, fetchStatus]);

    const handleCancel = useCallback(
        async (node) => {
            if (!workspaceId || !node?.jobKey) {
                return;
            }
            setCancellingKeys((prev) => {
                const next = new Set(prev);
                next.add(node.jobKey);
                return next;
            });
            try {
                const response = await fetch(`/api/queues/${workspaceId}/cancel`, {
                    method: "post",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobKey: node.jobKey }),
                });
                const payload = await response.json();
                if (!response.ok || payload.success !== true) {
                    throw new Error(payload.error || "Unable to cancel job");
                }
                await fetchStatus();
            } catch (err) {
                console.error(err);
                setError(err?.message || "Unable to cancel job");
            } finally {
                setCancellingKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(node.jobKey);
                    return next;
                });
            }
        },
        [workspaceId, fetchStatus]
    );

    if (!workspaceId) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                Select a workspace to view queue activity.
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-800">Queue Monitor</h1>
                    <p className="text-xs text-slate-500">Workspace {workspaceId}</p>
                </div>
                <div className="flex items-center gap-2">
                    {lastUpdated && (
                        <span className="text-xs text-slate-500">
                            Last updated: {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        onClick={() => fetchStatus()}
                        disabled={loading}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {loading && (
                <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    Loading queue data...
                </div>
            )}

            {queues.length === 0 && !loading ? (
                <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    No jobs are currently scheduled for this workspace.
                </div>
            ) : (
                queues.map((queue) => (
                    <div key={queue.queueName} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-semibold text-slate-700">
                                    {queue.queueType ?? "Queue"} queue
                                </div>
                                <div className="text-xs text-slate-500">{queue.queueName}</div>
                            </div>
                            <div className="text-xs text-slate-500">
                                Active: {queue.activeCount ?? 0} | Last activity:{" "}
                                {formatTimestamp(queue.lastActivity)}
                            </div>
                        </div>
                        {(queue.roots ?? []).length === 0 ? (
                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                No active jobs in this queue.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {queue.roots.map((node) => (
                                    <JobNode
                                        key={node.jobKey}
                                        node={node}
                                        onCancel={handleCancel}
                                        cancellingKeys={cancellingKeys}
                                        visited={new Set()}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
