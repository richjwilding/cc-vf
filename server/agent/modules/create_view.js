import { convertVisualizationToPrimitiveConfig, isObjectId } from "../../actions/SharedTransforms";
import { getLogger } from "../../logger";
import Category from "../../model/Category";
import PrimitiveConfig from "../../PrimitiveConfig";
import { addRelationship, createPrimitive, fetchPrimitives } from "../../SharedFunctions";
import { getConfigId, mostRecentResult, resolveId } from "../utils";

const logger = getLogger('agent_module_create_view', "debug", 2); // Debug level for moduleA


async function prepareCategorization( {axis, source, referenceId, parent} ){
    if( axis?.toPrepare ){
        logger.info(`Will create steps for visual categorization `, {axis, source})

        const builderData = {
                        workspaceId: parent.workspaceId,
                        paths: ['origin'],
                        parent: parent.id,
                        data:{
                            type: "categorizer",
                            title: "Categorizer" ,
                            referenceId: 132,
                            referenceParameters:{
                                referenceId,
                                cat_theme: axis.toPrepare.prompt,
                                count: axis.toPrepare.number,
                                field: axis.toPrepare.parameter
                            }
                        }
                    }
        const labellerData = {
                        workspaceId: parent.workspaceId,
                        paths: ['origin'],
                        parent: parent.id,
                        data:{
                            type: "categorizer",
                            title: "Categorizer" ,
                            referenceId: 133,
                            referenceParameters:{
                                referenceId,
                                cat_theme: axis.toPrepare.prompt,
                                field: axis.toPrepare.parameter
                            }
                        }
                    }
        console.log(builderData)
        console.log(labellerData)
        const builder = await createPrimitive( builderData )
        const labeller = await createPrimitive( labellerData )
        if( builder && labeller){
            logger.info(`linking - ${builder.id} / ${labeller.id}`)
            await addRelationship( builder.id, source, "imports")
            await addRelationship( labeller.id, source, "imports")
            await addRelationship( labeller.id, builder.id, "inputs.categories_categories")
            logger.info(`Done - ${builder.id} / ${labeller.id}`)
            return labeller.id
        }
        
    }
}

export async function implementation(params, scope, notify){
    const latestView = mostRecentResult ("design_view", scope.history)
    console.log(params)
    console.log(latestView)
    console.log(scope.vizSession)

    if( latestView ){
        try{
            const configs = JSON.parse( latestView.content)?.views

            let parentId
            let creatingInFlow = false
            if( scope.primitive.type === "flow" ){
                creatingInFlow = true
                parentId = scope.primitive.id
            }else if(scope.primitive.type === "board"){
                parentId = scope.primitive.id
            }
            if( !parentId ){
                throw "No parent to create view "
            }

            const referenceId = configs[0].referenceId
            const metadata = await Category.findOne( {id: referenceId })

            const newIds = []
            const sources = await fetchPrimitives(configs.map(d=>d.source))

            for( const view of configs){
                const {source, title, layout, filters, x_axis, y_axis, palette, referenceId} = view
                if( isObjectId(source)){
                    const {renderConfig, referenceParameters} = convertVisualizationToPrimitiveConfig({source, title, layout, filters, x_axis, y_axis, palette, metadata} )
                    console.log( renderConfig )
                    console.log( referenceParameters )


                    let thisSourceId = source
                    let thisSource = sources.find(d=>d.id === source)
                    if( thisSource && scope.activeFlowInstanceId && !thisSource.flowElement ){
                        thisSourceId = getConfigId( thisSource)
                        console.log(`Redirect to ${thisSourceId}`)
                    }

                    const categorizerIds = []
                    for( const d of [
                        referenceParameters.explore.axis.column,
                        referenceParameters.explore.axis.row,
                        ...(referenceParameters.explore.filters ?? [])
                        ]){
                           categorizerIds.push( await prepareCategorization({axis: d, source: thisSourceId, referenceId, parent: scope.primitive}) )
                    }
                    console.log(categorizerIds)
                    const categorizerId = categorizerIds.filter(Boolean).at(0)
                    
                    const data = {
                        workspaceId: scope.primitive.workspaceId,
                        paths: ['origin'],
                        parent: parentId,
                        data:{
                            type: "view",
                            title: title ?? "New visualization from Agent" ,
                            referenceId: PrimitiveConfig.Constants.VIEW,
                            referenceParameters,
                            renderConfig
                        }
                    }
                    const newPrimitive = await createPrimitive( data )
                    if( newPrimitive ){
                        newIds.push( newPrimitive.id)

                        await addRelationship( newPrimitive.id, categorizerId ?? thisSourceId, "imports")
                    }
                }
            }
            return {views: `created with id(s): ${newIds.join(", ")}`}
        }catch(e){
            logger.error(e)
            return {error: "couldnt parse configuration"}
        }
    }
    return {views: "no view configuration provided"}
}
export const definition = {
    "name": "create_view",
    "description": "Creates a view using the configuation returned by the design_view function. Called when the user has confirmed the visualization. ",
    "parameters": {
        "type": "object",
        "required": ["views","title"],
        "properties": {
        "title": {
            "type":"string",
            "description": "A title for this visualization"
        }
        },
        "additionalProperties": false
    }
}