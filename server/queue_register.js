const q_register = {}

export function registerQueue(name, object){
    if(q_register[name] && q_register[name] !== object){
        console.warn("**************************************************************")
        console.warn("**************************************************************")
        console.warn(`Got a different object being registered for ${name} - ignoring`)
        console.warn("**************************************************************")
        console.warn("**************************************************************")
        return
    }
    q_register[name] = object
}
export function getQueueObjectByName(name){
    return q_register[name]
}