const worker = new Worker(new URL('./router.worker.js', import.meta.url));

worker.onmessage = (event) => {
    if( event.data.type === "paths"){
        const paths = event.data.paths
        const obj = objTracker[event.data.idx]
        if( obj ){
            obj.requested = false
            if( obj?.renderCallback ){
                obj.renderCallback(paths)
            }
            if( obj.slippedRequest ){
                obj.slippedRequestCount  = 0
                obj.slippedRequest = false
                obj.route(obj.slippedRequestData)
                obj.slippedRequestData = undefined
            }
        }
    }else if( event.data.type === "data"){
        const paths = event.data.paths
        const obj = objTracker[event.data.idx]
        if( obj ){
            obj.byproduct = event.data.byproduct
            obj.shapes = event.data.shapes
        }
    }
};
    
let idx = 1
const objTracker = {}

export class OrthogonalConnector{
    constructor(options){
        const {renderCallback, ...opts} = options
        this.renderCallback = renderCallback
        this.requested = false
        this.slippedRequest = false
        this.slippedRequestCount = 0
        this.byproduct = {
            spots:[],
            vRulers:[],
            hRulers:[],
            connections:[]
        }
        this.idx = idx
        objTracker[idx] = this

        worker.postMessage({
            type: "create",
            idx,
            options: opts
        })
        idx++

    }
    shutdown(){
        worker.postMessage({
            type: "destroy",
            idx: this.idx,
        })
        delete objTracker[this.idx]
    }
    removeShape(data){
        worker.postMessage({
            type: "remove",
            idx: this.idx,
            data
        })
    }
    addShape(data){
        worker.postMessage({
            type: "add",
            idx: this.idx,
            data
        })
    }
    setScale(a, b){
        worker.postMessage({
            type: "setScale",
            idx: this.idx,
            a,
            b
        })
    }
    moveShape(id, position){
        worker.postMessage({
            type: "move",
            idx: this.idx,
            id,
            position
        })
    }
    route(links){
        if( this.requested){
            this.slippedRequest = true
            this.slippedRequestData = links
            this.slippedRequestCount++
            return
        }
        this.requested = true
        worker.postMessage({
            type: "route",
            idx: this.idx,
            options: {
                links
            }
        })
    }
}
