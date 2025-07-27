import { getLogger } from "../../logger";
import Category from "../../model/Category";
import { getDataForImport, uniquePrimitives } from "../../SharedFunctions";
import { getCategoryParameterNameForAgent, resolveId } from "../utils";

const logger = getLogger('agent_module_parameter_values_for_data', "debug", 2); // Debug level for moduleA

export async function implementation(params, scope, notify){
        const sources = await resolveId( params.source_ids, scope )
        logger.info(`Will get data from ${sources.map(d=>d.id).join(", ")}`, {chatId: scope.chatUUID})

        notify(`Fetching data...`,true)
        let items = []
        for(const d of sources){
            items.push(...(await getDataForImport( d )))
        }
        items = uniquePrimitives( items )
          
        const resultCategories = (await Category.find({id: {$in: items.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d) === i)}})).reduce((a,c)=>{a[c.id] = c; return a},{})
        const type = {}

        const out = {}
        function add(p, v){
          if( !out[p] ){
            out[p] = {}
          }
          out[p][v] ||= 0
          out[p][v]++
        }
        
        for(const d of items){
            const paramsForAgent = getCategoryParameterNameForAgent( resultCategories[d.referenceId] )
            for(const p of paramsForAgent){
              if( !type[p]){
                type[p] = resultCategories[d.referenceId].parameters[p]
              }
              let v = d.referenceParameters?.[p]
              if( !Array.isArray(v)  ){
                add(p, v)
                continue
              }
              for(const d of v){
                add(p, d)
              }
            }
        }

        const parameter_values = {};
        for (const [p, set] of Object.entries(out)) {
          const pairs = Object.entries(set)

          if( type[p].type === "date"){
            const sorted = pairs.map(d=>d[0]).sort()
            const min = sorted.at(0)
            const max = sorted.at(-1)
            if( min && max){
              parameter_values[p] = {
                type: "date",
                min,
                max
              }
            }
            continue
          }else if(type[p].axisType === "custom_bracket"){
            const buckets = type[p].axisData?.buckets
            if( buckets ){
              const out = buckets.map(d=>0)
              for( const pair of pairs ){
                const val = pair[0]
                if( val !== undefined){
                  const bucket = buckets.findIndex(d=>{
                    if( d.min !== undefined){
                      if( val < d.min ){
                        return false
                      }
                    }
                    if( d.lessThan !== undefined){
                      if( val >= d.lessThan ){
                        return false
                      }
                    }
                    return true
                  })
                  if( bucket ){
                    out[bucket]++
                  }
                }
              }
              parameter_values[p] = buckets.reduce((a, d, i)=>{a[d.label] = out[i]; return a}, {})
              continue
            }
          }

          parameter_values[p] = pairs.map(d=>({value: d[0], count: d[1]}))
        }

        return { 
          parameter_values,
         };
    }
export const definition = {
        "name": "parameter_values_for_data",
        "description": "Fetch unique values for specified parameter fields from the given data source objects to help determine filter options and view layouts.",
        "parameters": {
          "type": "object",
          "required": ["source_ids", "parameters"],
          "properties": {
            "source_ids": {
              "type": "array",
              "items": { "type": "string" },
              "description": "List of data object IDs (view/query/filter/search) to fetch values from."
            },
            "parameters": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Names of the fields/parameters for which to collect unique values."
            },
            "sample_limit": {
              "type": "integer",
              "minimum": 1,
              "description": "Optional max number of records to sample per source for value extraction."
            }
          },
          "additionalProperties": false
        }
      }