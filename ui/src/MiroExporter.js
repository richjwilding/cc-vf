import MainStore from "./MainStore"
import { Miro, MiroApi } from "@mirohq/miro-api"
export default function MiroExporter(primitive){
    let obj ={
        init:async function(){
            console.log(`CHECKING : ${this.activeBoard}`)
            if( this.activeBoard ){
                return
            }
            const api = new MiroApi('eyJtaXJvLm9yaWdpbiI6ImV1MDEifQ_VYDgjpXTjnP_hgMwN-bOMSr8-GA')

            console.log(`opened`)
            obj.boards = []
            for await (const board of await api.getAllBoards()) {
                obj.boards.push(board)
                console.log(board)
              }
            obj.activeBoard = obj.boards[0]

              console.log('done')
//            window.open('/miro/login')
            obj.api = api
            return obj
        },
       /* addPrimitive:async function(options = { x: 0, y: 0, width: 100, height: 100, color: "#fff9b1"} ){
            await this.init()
            let ids = []
            const sticky = await obj.activeBoard.createShapeItem({
                data: {
                  content: options.text,
                  shape: "rectangle",
                },
                style: {
                    fillColor: options.color,
                    textAlign: 'left',
                    textAlignVertical: 'top'
                  },
                position: {origin: 'center', x: options.x, y: options.y},
                geometry: {height: options.height, width: options.width}
              })
                
            ids.push(sticky.id)
            const text = await obj.activeBoard.createShapeItem({
                data: {
                    content: options.id
                },
                style: {
                    borderOpacity: '0.001',
                    borderWidth: '1.1'
                },
                position: {origin: 'center', x: options.x + 4 , y: options.y + (options.height / 2) - 20},
                geometry: {height: 20, width: options.width - 4}

            })
            ids.push(text.id)

            const pHeight = 20
            const step = pHeight + 5

            if( options.params ){
                let offset = step
                for( const param of options.params ){
                    const text = await obj.activeBoard.createShapeItem({
                        data: {
                            content: param
                        },
                        style: {
                            borderOpacity: '0.001',
                            borderWidth: '1.1'
                        },
                        position: {origin: 'center', x: options.x + 4 , y: options.y - (options.height / 2) + options.paramsOffset + (offset)},
                        geometry: {height: pHeight, width: options.width - 4}

                    })
                    ids.push(text.id)
                    offset += step

                }
            }

            return sticky
        },*/
       addPrimitive:async function(options ){

            const colors = ["#fbb4ae","#b3cde3","#ccebc5","#decbe4","#fed9a6","#ffffcc","#e5d8bd","#fddaec","#f2f2f2"]
            const scoreColors = ["#6e40aa","#6054c8","#4c6edb","#368ce1","#23abd8","#1ac7c2","#1ddfa3","#30ef82","#52f667","#7ff658","#aff05b"]


            let colorUse = {}

            await this.init()
            let ids = []
            const sticky = await obj.activeBoard.createAppCardItem({
                data: {
                    title: options.text,
                    status: 'disabled',
                    fields:options.params.map((p, idx)=>{
                        if( p.type === "score"){

                            return {
                                value: `${p.title}: ${p.value}`, 
                                fillColor: scoreColors[p.value],
                                fillOpacitiy: "0.4"
                            }
                        }else if( p.type === "contact"){
                            let col = colorUse[p.value]
                            if( !col){
                                colorUse[p.value] = colors[ Object.keys(colorUse).length % colors.length]
                                col = colorUse[p.value]
                            }
                            return {
                                value: p.title, 
                                fillColor: col,
                                fillOpacitiy: "0.4"
                            }
                        }
                        else{
                            return {
                                value: p.value, 
                            }
                        }
                    })
                },
                position: {origin: 'center', x: options.x, y: options.y},
                geometry: {height: options.height, width: options.width}
            })
        },
        addShape:async function(options = { x: 0, y: 0, width: 100, height: 100, color: "#fff9b1"} ){
            await this.init()
            let ids = []
            const sticky = await obj.activeBoard.createShapeItem({
                data: {
                  shape: "rectangle",
                  content: options.text
                },
                style: {
                    fillColor: options.color,
                    fillOpacity: `${options.opacity || 1.0}`,
                    borderOpacity: `${options.borderOpacity || 0.2}`,
                  },
                position: {origin: 'center', x: options.x, y: options.y},
                geometry: {height: options.height, width: options.width}
              })
        },
        exportFromExplorer:async function(node){
            if(!node){return}
            let pcards = [...node.querySelectorAll('.pcard')]
            const origin = node.getBoundingClientRect()
            const _this = this
            const mainstore = MainStore()

            const rgba2hex = (rgba) => `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`


            let title =  [...node.querySelectorAll('.vfbgtitle')]
            

            let shapes =  [...node.querySelectorAll('.vfbgshape')]
            for( const shape of shapes){
                const bbox = shape.getBoundingClientRect()

                const fullColor = rgba2hex(window.getComputedStyle(shape).backgroundColor)
                const color = fullColor.slice(0,7)
                const opacity = parseInt(fullColor.slice(-2)) / 256

                const out = await _this.addShape({
                    x: bbox.x - origin.x + (bbox.width / 2),
                    y: bbox.y - origin.y + (bbox.height / 2),
                    width: bbox.width,
                    height: bbox.height,
                    opacity: opacity,
                    color: color,
                })

                console.log(out)

            }


            for( const shape of title){
                const bbox = shape.getBoundingClientRect()


                const out = await _this.addShape({
                    x: bbox.x - origin.x + (bbox.width / 2),
                    y: bbox.y - origin.y + (bbox.height / 2),
                    width: bbox.width,
                    height: bbox.height,
                    borderOpacity: 0.0001,
                    text: shape.textContent
                })

                console.log(out)

            }

            for( const card of pcards){
                const bbox = card.getBoundingClientRect()

                const primitive = mainstore.primitiveByPlain(parseInt(card.getAttribute('id')))
                const params = [
                 //   {title: 'Scale', value: primitive.referenceParameters.scale, type: "score"},
                    {title: 'Specificity', value: primitive.referenceParameters.specificity, type: "score"},
                //    {title: primitive.origin.referenceParameters.contactName, value: primitive.origin.referenceParameters.contactId , type: "contact"},
                 //   {title: 'Category', value: primitive.referenceParameters.category, type: "text"},
                ].filter((d)=>d)

                const titleHeight = card.querySelector('.break-word')?.getBoundingClientRect().height


                console.log(bbox)
                const shape = await _this.addPrimitive({
                    x: bbox.x - origin.x + (bbox.width / 2),
                    y: bbox.y - origin.y+ (bbox.height / 2),
                    width: bbox.width,
                    height: bbox.height,
                    text: primitive.title,
                    paramsOffset: titleHeight,
                    params: params,
                    id: `#${primitive.plainId}`,
                    color: "#ffffff",
                })

                console.log(shape)

            }
            
        }

        
    }
    return obj
}