import { registerAction } from "../action_helper"
import { getLogger } from "../logger";
import { doPrimitiveAction, getDataForImport } from "../SharedFunctions"
const logger = getLogger('actionrunner'); // Debug level for moduleA

registerAction( "run_runner", undefined, async (primitive, action, options, req)=>{
    let list = await getDataForImport( primitive ) 
    logger.info(`Action runner ${primitive.id} / ${primitive.plainId} got ${list.length} items for ${options.action} / ${options.flowStarted} / ${options.newIteration}`)
    
    if( !options.newIteration ){
        list = list.filter(d=>d.processing?.flow?.start !== options.flowStarted)
        logger.info(`Fltered to ${list.length} for flow continuation`)
    }

    for(const d of list ){
        logger.info(` - Will run ${options.action} for ${d.id} / ${d.plainId}`)
        try{
            await doPrimitiveAction(d, options.action, options.actionOptions)
        }catch(e){
            logger.error(`Error in run_runner action`)
            logger.error(e)
            throw e
        }
    }
})