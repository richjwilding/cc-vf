import mongoose from "mongoose";

const LeanPrimitiveResolved = mongoose.connection.collection("lean_primitives_resolved");

function toObjectId(value) {
  if (value == null) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  try {
    return new mongoose.Types.ObjectId(value);
  } catch (error) {
    return null;
  }
}

function normalizeStartingIds(ids) {
  return [ids]
    .flat()
    .map(toObjectId)
    .filter(Boolean);
}

export async function fetchConnectedHierarchy({ workspaceId, rootIds }) {
  const startIds = normalizeStartingIds(rootIds);
  if (!workspaceId || !startIds.length) {
    return [];
  }

  const pipeline = [
    {
      $match: {
        workspaceId,
        deleted: { $exists: false },
        _id: { $in: startIds },
      },
    },
    {
      $graphLookup: {
        from: "lean_primitives_resolved",
        startWith: "$_id",
        connectFromField: "importsIds",
        connectToField: "_id",
        as: "chain",
        depthField: "depth",
        restrictSearchWithMatch: {
          workspaceId,
          deleted: { $exists: false },
        },
      },
    },
    {
      $set: {
        chain: {
          $map: {
            input: "$chain",
            as: "node",
            in: {
              _id: "$$node._id",
              depth: "$$node.depth",
              type: "$$node.type",
              referenceId: "$$node.referenceId",
              importsIds: { $ifNull: ["$$node.importsIds", []] },
              referenceParameters: "$$node.referenceParameters",
              parentPrimitives: "$$node.parentPrimitives",
              rootId: "$_id",
              title: "$$node.title",
              plainId: "$$node.plainId",
              primitives: "$$node.primitives",
            },
          },
        },
      },
    },
    { $project: { root: { _id: "$_id", type: "$type", referenceId: "$referenceId", title: "$title" }, chain: 1 } },
    { $unwind: { path: "$chain", preserveNullAndEmptyArrays: true } },
    { $replaceRoot: { newRoot: { $mergeObjects: ["$chain", { root: "$root" }] } } },
  ];

  return LeanPrimitiveResolved.aggregate(pipeline).toArray();
}

export default fetchConnectedHierarchy;
