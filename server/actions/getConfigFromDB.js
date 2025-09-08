import mongoose from 'mongoose';
import Primitive from '../model/Primitive';
import { fetchPrimitiveInputs } from '../InputHandler';

var ObjectId = mongoose.Types.ObjectId;
const PrimitiveConfigView = mongoose.connection.collection("primitives_for_config");

export async function getConfigFromDB(primitive, { skipInputs = false, skipDynamicPins = true }, cache = {}) {
    const key = `${primitive.id}-${skipInputs}-${skipDynamicPins}`
    if( cache?.config ){
        if( cache.config[key]){
            return cache.config[key]
        }
    }

    const pipeline = [
        // 0) Start at the node
        {
            $match: {
                _id: ObjectId(primitive.id)
            }
        },

        {
            $graphLookup: {
                from: "primitives_for_config",
                startWith: "$configParents",
                connectFromField: "configParents",
                connectToField: "_id",
                as: "ancestors",
                depthField: "gDepth",
                maxDepth: 50,
                restrictSearchWithMatch: {
                    deleted: {
                        $ne: true
                    }
                }
            }
        },
        // 2) Root node snapshot
        {
            $project: {
                rootNode: {
                    _id: "$_id",
                    referenceId: "$referenceId",
                    referenceParameters: {
                        $ifNull: ["$referenceParameters", {}]
                    },
                    connectedInputPins: {
                        $map: {
                            input: {
                                $objectToArray: {
                                    $ifNull: [
                                        "$primitives.inputs",
                                        {}
                                    ]
                                }
                            },
                            as: "inp",
                            in: "$$inp.k" // e.g. "inputPins-1_items"
                        }
                    }
                },
                ancestors: 1
            }
        },
        // 3) Fetch category ONCE from root referenceId; derive global defaults & pin keys
        {
            $lookup: {
                from: "categories",
                let: {
                    cid: "$rootNode.referenceId"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ["$id", "$$cid"]
                            }
                        }
                    }
                ],
                as: "cat"
            }
        },
        {
            $set: {
                cat: {
                    $first: "$cat"
                }
            }
        },
        {
            $set: {
                categoryDefaultsGlobal: {
                    $let: {
                        vars: {
                            paramsA: {
                                $objectToArray: {
                                    $ifNull: ["$cat.parameters", {}]
                                }
                            }
                        },
                        in: {
                            $arrayToObject: {
                                $map: {
                                    input: {
                                        $filter: {
                                            input: "$$paramsA",
                                            as: "p",
                                            cond: {
                                                $and: [
                                                    {
                                                        $ne: [
                                                            {
                                                                $type:
                                                                    "$$p.v.default"
                                                            },
                                                            "missing"
                                                        ]
                                                    },
                                                    {
                                                        $ne: [
                                                            "$$p.v.default",
                                                            null
                                                        ]
                                                    }
                                                    // optionally exclude empty strings: { $ne: ["$$p.v.default", ""] }
                                                ]
                                            }
                                        }
                                    },
                                    as: "p",
                                    in: {
                                        k: "$$p.k",
                                        v: "$$p.v.default"
                                    }
                                }
                            }
                        }
                    }
                },
                categoryParamKeysGlobal: {
                    $map: {
                        input: { $objectToArray: { $ifNull: ["$cat.parameters", {}] } },
                        as: "e",
                        in: "$$e.k"
                    }
                },
                pinKeysGlobal: {
                    $map: {
                        input: { $objectToArray: { $ifNull: [{ $ifNull: ["$cat.pins.input", {}] }, {}] } },
                        as: "pd",
                        in: "$$pd.k"
                    }
                },

                pinKeysGlobal: {
                    $map: {
                        input: {
                            $objectToArray: {
                                $ifNull: [
                                    {
                                        $ifNull: ["$cat.pins.input", {}]
                                    },
                                    {}
                                ]
                            }
                        },
                        as: "pd",
                        in: "$$pd.k"
                    }
                }
            }
        },
        // 4) Build the chain (self depth=0; ancestors start at 1) and derive their connected pins
        {
            $project: {
                rootNode: 1,
                pinKeysGlobal: 1,
                categoryDefaultsGlobal: 1,
                categoryParamKeysGlobal: 1,
                chainAll: {
                    $concatArrays: [
                        [
                            {
                                node: "$rootNode",
                                nodeDepth: 0
                            }
                        ],
                        {
                            $map: {
                                input: "$ancestors",
                                as: "a",
                                in: {
                                    node: {
                                        _id: "$$a._id",
                                        referenceId: "$$a.referenceId",
                                        referenceParameters: {
                                            $ifNull: [
                                                "$$a.referenceParameters",
                                                {}
                                            ]
                                        },
                                        connectedInputPins: {
                                            $map: {
                                                input: {
                                                    $objectToArray: {
                                                        $ifNull: [
                                                            "$$a.primitives.inputs",
                                                            {}
                                                        ]
                                                    }
                                                },
                                                as: "inp",
                                                in: "$$inp.k"
                                            }
                                        }
                                    },
                                    nodeDepth: {
                                        $add: ["$$a.gDepth", 1]
                                    } // parent=1, grandparent=2, ...
                                }
                            }
                        }
                    ]
                }
            }
        },
        // 5) Process one node at a time
        {
            $unwind: "$chainAll"
        },
        {
            $replaceWith: {
                $mergeObjects: [
                    "$chainAll",
                    {
                        pinKeysGlobal: "$pinKeysGlobal",
                        categoryDefaultsGlobal:
                            "$categoryDefaultsGlobal",
                        categoryParamKeysGlobal: "$categoryParamKeysGlobal"
                    }
                ]
            }
        }, {
            $set: {
                __strictOverridePins: skipDynamicPins
            }
        },
        // 6) Locals + annotate connected pins; collect local keys
        {
            $set: {
                localParams: {
                    $ifNull: ["$node.referenceParameters", {}]
                },
                localKeys: {
                    $map: {
                        input: {
                            $objectToArray: {
                                $ifNull: [
                                    "$node.referenceParameters",
                                    {}
                                ]
                            }
                        },
                        as: "e",
                        in: "$$e.k"
                    }
                },
                connectedPinsAnnotated: {
                    $map: {
                        input: {
                            $ifNull: [
                                "$node.connectedInputPins",
                                []
                            ]
                        },
                        as: "cp",
                        in: {
                            full: "$$cp",
                            suffix: {
                                $let: {
                                    vars: {
                                        parts: {
                                            $reverseArray: {
                                                $split: ["$$cp", "_"]
                                            }
                                        }
                                    },
                                    in: {
                                        $arrayElemAt: ["$$parts", 0]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        {
            $set: {
                __allowedPinsForNode: {
                    $setUnion: [
                        { $ifNull: ["$categoryParamKeysGlobal", []] }, // all defined category params
                        { $ifNull: ["$localKeys", []] }                // this node's local fields
                    ]
                }
            }
        },
        // 7) Keep only connected pins that are category pins AND NOT defined locally (same node)
        {
            $set: {
                connectedPinsAnnotated: {
                    $filter: {
                        input: "$connectedPinsAnnotated",
                        as: "c",
                        cond: {
                            $and: [
                                {
                                    $in: [
                                        "$$c.suffix",
                                        "$pinKeysGlobal"
                                    ]
                                },
                                // must be a category input pin
                                {
                                    $not: [
                                        {
                                            $in: [
                                                "$$c.suffix",
                                                "$localKeys"
                                            ]
                                        }
                                    ]
                                },
                                // not defined locally (same node)
                                {
                                    $or: [
                                        {
                                            $ne: [
                                                "$__strictOverridePins",
                                                true
                                            ]
                                        },
                                        // toggle OFF → allow all (current behavior)
                                        {
                                            $in: [
                                                "$$c.suffix",
                                                "$__allowedPinsForNode"
                                            ]
                                        } // toggle ON → allow only if in defaults OR locals
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        },
        // 8) Build override requests (carry nodeDepth for proximity)
        {
            $set: {
                overrideRequests: {
                    $map: {
                        input: "$connectedPinsAnnotated",
                        as: "m",
                        in: {
                            primitiveId: "$node._id",
                            pinName: "$$m.suffix",
                            param: "$$m.suffix",
                            fullAddress: "$$m.full",
                            nodeDepth: "$nodeDepth"
                        }
                    }
                }
            }
        },
        // 9) Keep per-node fields
        {
            $project: {
                _id: 0,
                nodeId: "$node._id",
                nodeDepth: 1,
                localParams: 1,
                overrideRequests: 1,
                pinKeysGlobal: 1,
                categoryDefaultsGlobal: 1
            }
        },
        // 10) Aggregate back to a single doc
        {
            $group: {
                _id: null,
                layers: {
                    $push: {
                        nodeDepth: "$nodeDepth",
                        localParams: "$localParams"
                    }
                },
                requests: {
                    $push: "$overrideRequests"
                },
                chainIds: {
                    $push: {
                        nodeDepth: "$nodeDepth",
                        id: "$nodeId"
                    }
                },
                categoryDefaultsGlobal: {
                    $first: "$categoryDefaultsGlobal"
                },
                pinKeysGlobal: {
                    $first: "$pinKeysGlobal"
                }
            }
        },
        // 11) Sort layers by depth asc (child=0 first); also order chainIds
        {
            $set: {
                layers: {
                    $sortArray: {
                        input: "$layers",
                        sortBy: {
                            nodeDepth: 1
                        }
                    }
                },
                chainIds: {
                    $sortArray: {
                        input: "$chainIds",
                        sortBy: {
                            nodeDepth: 1
                        }
                    }
                }
            }
        },
        // 12) Locals merge: nearest wins across the whole chain (child overrides parent, etc.)
        {
            $set: {
                localsMergedNearestWins: {
                    $reduce: {
                        input: {
                            $map: {
                                input: "$layers",
                                as: "ly",
                                in: {
                                    $ifNull: ["$$ly.localParams", {}]
                                }
                            }
                        },
                        initialValue: {},
                        in: {
                            $mergeObjects: ["$$this", "$$value"]
                        } // accumulated (nearer) wins
                    }
                }
            }
        },
        // 12b) Build nearest-local depth per pin across the whole chain
        {
            $set: {
                _localDepthPairs: {
                    $reduce: {
                        input: "$layers",
                        initialValue: [],
                        in: {
                            $concatArrays: [
                                "$$value",
                                {
                                    $map: {
                                        input: {
                                            $map: {
                                                input: {
                                                    $objectToArray: {
                                                        $ifNull: [
                                                            "$$this.localParams",
                                                            {}
                                                        ]
                                                    }
                                                },
                                                as: "e",
                                                in: "$$e.k"
                                            }
                                        },
                                        as: "k",
                                        in: {
                                            k: "$$k",
                                            depth: "$$this.nodeDepth"
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        },
        // keep the NEAREST depth per pin (smallest nodeDepth wins)
        {
            $set: {
                nearestLocalDepthByPin: {
                    $arrayToObject: {
                        $map: {
                            input: {
                                $sortArray: {
                                    input: "$_localDepthPairs",
                                    sortBy: {
                                        depth: -1
                                    }
                                } // largest first → smallest last
                            },
                            as: "p",
                            in: {
                                k: "$$p.k",
                                v: "$$p.depth"
                            } // last write wins => nearest depth
                        }
                    }
                }
            }
        },
        // 13) Flatten override requests
        {
            $set: {
                overrideRequests: {
                    $reduce: {
                        input: "$requests",
                        initialValue: [],
                        in: {
                            $concatArrays: ["$$value", "$$this"]
                        }
                    }
                }
            }
        },
        // 14) Suppress any override if a nearer-or-equal local exists for that pin
        {
            $set: {
                overrideRequests: {
                    $filter: {
                        input: "$overrideRequests",
                        as: "o",
                        cond: {
                            $let: {
                                vars: {
                                    // if no local for this pin, use a huge depth so the override is kept
                                    localDepth: {
                                        $ifNull: [
                                            {
                                                $getField: {
                                                    input: {
                                                        $ifNull: [
                                                            "$nearestLocalDepthByPin",
                                                            {}
                                                        ]
                                                    },
                                                    field: "$$o.pinName"
                                                }
                                            },
                                            999999
                                        ]
                                    }
                                },
                                // keep only if the override is nearer than the nearest/equal local
                                in: {
                                    $lt: [
                                        "$$o.nodeDepth",
                                        "$$localDepth"
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        },
        // 15) Dedupe overrides so the NEAREST override wins (one per pin)
        {
            $set: {
                overrideRequestsSorted: {
                    $sortArray: {
                        input: "$overrideRequests",
                        sortBy: {
                            nodeDepth: -1
                        }
                    }
                }
            }
        },
        {
            $set: {
                overrideByPinObj: {
                    $arrayToObject: {
                        $map: {
                            input: "$overrideRequestsSorted",
                            as: "o",
                            in: {
                                k: "$$o.pinName",
                                v: "$$o"
                            }
                        }
                    }
                }
            }
        },
        {
            $set: {
                overrideRequestsNearest: {
                    $map: {
                        input: {
                            $objectToArray: {
                                $ifNull: ["$overrideByPinObj", {}]
                            }
                        },
                        as: "e",
                        in: "$$e.v"
                    }
                }
            }
        },
        {
            $lookup: {
                from: "primitives_for_config",
                localField:
                    "overrideRequestsNearest.primitiveId",
                // array of ids
                foreignField: "_id",
                as: "overridePrimitives"
            }
        },
        {
            $project: {
                _id: 0,
                overridePrimitives: 1,
                effectiveWithoutOverrides: {
                    $mergeObjects: [
                        "$categoryDefaultsGlobal",
                        // same for all nodes
                        "$localsMergedNearestWins" // locals with nearest (including child) winning
                    ]
                },
                overrideRequests:
                    "$overrideRequestsNearest",
                orderedChainIds: {
                    $map: {
                        input: "$chainIds",
                        as: "e",
                        in: "$$e.id"
                    }
                }
            }
        }
    ]

    try {
        let { overrideRequests, effectiveWithoutOverrides, overridePrimitives } = (await PrimitiveConfigView.aggregate(pipeline).toArray())?.[0]
        const inputsForPrimitives = {}
        const config = effectiveWithoutOverrides

        overridePrimitives = overridePrimitives.map(d => Primitive.hydrate(d))
        
        if( cache?.config ){
            cache.config[`${primitive.id}-true-${skipDynamicPins}`] = config
        }

        if (!skipInputs) {
            for (const d of overridePrimitives ?? []) {
                inputsForPrimitives[d.id] =  await fetchPrimitiveInputs( d, undefined, undefined, undefined, cache )
            }

            for (const ovr of overrideRequests) {
                const inputs = inputsForPrimitives[ovr.primitiveId.toString()]
                const source = inputs?.[ovr.pinName]
                const data = source?.data
                if (data) {
                    config[ovr.pinName] = data
                }
            }
            if( cache?.config ){
                cache.config[`${primitive.id}-false-${skipDynamicPins}`] = config
            }
        }
        return config
    } catch (e) {
        console.log(e)
        throw "Couldnt run aggregation for config"
    }
}