export const pipeline_root_categories = [
    /// prior stages should have selected source documents 
    {
    $project: {
      _id: 0,
      refParentIds: {
        $map: {
          input: {
            $filter: {
              input: { $objectToArray: "$parentPrimitives" }, // [{k, v}]
              as: "pp",
              cond: { $in: ["primitives.ref", "$$pp.v"] }
            }
          },
          as: "pp",
          in: { $toObjectId: "$$pp.k" } // convert keys to ObjectId
        }
      }
    }
  },

  // Dedupe all ref parents across the entire matched set
{ $unwind: "$refParentIds" },
{ $group: { _id: null, refParentIds: { $addToSet: "$refParentIds" } } },

  // Lookup those ref parents, and inside the sub-pipeline extract their origin parents
  {
    $lookup: {
      from: "primitives",
      localField: "refParentIds",
      foreignField: "_id",
      pipeline: [
        {
          $match: {
            deleted: { $exists: false },
            workspaceId: "689207ad204c0ab912af2817"            
          }
        },
        {
          $project: {
            _id: 0,
            originParentIds: {
              $map: {
                input: {
                  $filter: {
                    input: { $objectToArray: "$parentPrimitives" },
                    as: "pp2",
                    cond: { $in: ["primitives.origin", "$$pp2.v"] }
                  }
                },
                as: "pp2",
                in: { $toObjectId: "$$pp2.k" }
              }
            }
          }
        }
      ],
      as: "refParents"
    }
  },

  // Flatten & dedupe all originParentIds from all ref parents
  {
    $set: {
      originParentIds: {
        $reduce: {
          input: "$refParents.originParentIds",
          initialValue: [],
          in: { $setUnion: ["$$value", "$$this"] }
        }
      }
    }
  },
  {
    $lookup: {
      from: "primitives",
      localField: "originParentIds",
      foreignField: "_id",
      pipeline: [
        {
          $match: {
             deleted: { $exists: false },
            workspaceId: "689207ad204c0ab912af2817"          
          }
        },        
        {
          $set: {
            originObjIds: {
              $map: {
                input: { $ifNull: ["$primitives.origin", []] },
                as: "sid",
                in: { $toObjectId: "$$sid" }
              }
            }
          }
        },
        // Children join (index-friendly; no $expr)
        {
          $lookup: {
            from: "primitives",
            localField: "originObjIds",
            foreignField: "_id",
            as: "children",
             pipeline: [
        {
          $match: {
            deleted: { $exists: false },
            workspaceId: "689207ad204c0ab912af2817"            
          }
        },
          {
          		$project: {primitives:0, parentPrimitives:0, rationale: 0,processing: 0}
            }
               ]
          }
        }
      ],
      as: "categories"
    }
  },
  { $unwind: { path: "$categories", preserveNullAndEmptyArrays: false } },
	{ $replaceRoot: { newRoot: "$categories" } },
  {$project:{
  	processing: 0,
    originObjIds:0,
    primitives:0, 
    parentPrimitives:0
  }
  }
]