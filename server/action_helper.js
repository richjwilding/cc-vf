import Category from "./model/Category"
import { dispatchControlUpdate } from "./SharedFunctions"

let _actionMap
function getActionMap(){
    if(!_actionMap){
        _actionMap = {}
    }
    return _actionMap
}

export function registerAction( action, mappings, callback){
    const actionMap = getActionMap()
    if( !action){
        return false
    }
    actionMap[action] ||= {types: {}, categories: {}}
    let obj = actionMap[action]
    if( !mappings || mappings.length === 0){
        mappings = [{}]
    }
    for(const d of [mappings].flat()){
        const id = d.id ?? "default"
        let type = "type"
        if( d.type === "categoryId" ){
            obj = obj.categories
            type = "categoryId"
        }else{
            obj = obj.types
        }
        if( obj[id]){
            console.log(`Overwriting action ${action} for ${id} / ${d.type}`)
        }
        obj[ id ] = callback
    }
}
export async function runAction(primitive, actionKey, options, req){
    const actionMap = getActionMap()
    const category = await Category.findOne({id: primitive.referenceId})
    
    let action = category?.actions?.find((d)=>d.key === actionKey)
    const command = action?.command || actionKey

    let actionCall = actionMap[command]?.categories[primitive.referenceId] ?? actionMap[command]?.types[primitive.type] 
    if( !actionCall ){
        actionCall = actionMap[command]?.types.default
        console.log(`Looking for default for ${command}`)
    }
    if( !actionCall ){
        console.warn(`Cant find action definition for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${actionKey}`)
        return {success: false}
    }
    dispatchControlUpdate(primitive.id, `aLog.${actionKey}`, {status: "invoked", user: req?.user?.id, date_invoked: new Date()})
    return {success: true, result: await actionCall(primitive, action ?? actionKey, options, req)}

}