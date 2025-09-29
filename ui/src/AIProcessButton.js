import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import useDataEvent from "./CustomHook";
import MainStore from "./MainStore";

export default function AIProcessButton({primitive, ...props}){

  useDataEvent("set_field", primitive.id)

    let title = <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
    let promptDelete = async (e)=>{
        e.stopPropagation();
        let items = props.showDelete.primitives.allPrompt.map(d=>d.primitives.allItems).flat()
        console.log(items)
        items = items.filter((d)=>d.parentPrimitiveIds.includes(primitive.id))
        MainStore().promptDelete({
          prompt: `Remove ${items.length} existing responses?`,
          handleDelete: async ()=>{
            for(const d of items){
              await MainStore().removePrimitive( d )
            }
            MainStore().promptDelete(false)
          }
        })
        
    }
    let action = async (e)=>{
        e.stopPropagation();
        if( props.process ){
            if( props.markOnProcess ){
              console.warn("DEPRECATED")
            }
            props.process(primitive)
        }else{
          const action = primitive.metadata.actions.find(d=>d.key === (props.actionKey ?? props.active))
          console.log(action)
          if( action ){
            if( action.actionFields ){
              MainStore().globalInputPopup({
                  primitive: primitive,
                  fields: action.actionFields,
                  confirm: async (inputs)=>{
                    //await MainStore().doPrimitiveAction(primitive, d.key, inputs, props.callbackProcessor)
                    await MainStore().doPrimitiveAction(primitive, action.key, inputs)
                  }
                })
            }else{
              MainStore().doPrimitiveAction(primitive, action.key)
            }
          }
        }
    }
    let active = false
    let error = false
    if( primitive.processing){
        error = props.active && primitive.processing[props.active]?.state === "error"
        active = !error && (props.active === undefined || primitive.processing[props.active]?.status === "pending" || primitive.processing[props.active]?.status === "running")
        if( props.subset && primitive.processing[props.active]?.subset ){
          if( !primitive.processing[props.active].subset.includes(props.subset)){
            active = false
          }
        }

      if( error || (new Date() - new Date(primitive.processing[props.active]?.started)) > (25 * 60 *1000) ){
        title = <div className='text-red-600'><FontAwesomeIcon icon='triangle-exclamation'/> Error</div>
        active = false
        error = true
      }else if(active){
        let progress = primitive.processing[props.active]?.progress
        const percent = progress?.percentage ?? progress
        if( !isNaN(percent) || percent === undefined ){
          const percentage = parseInt((percent ?? 0) * 100) + "%"
          title = <div className=''><FontAwesomeIcon icon='spinner' className="animate-spin mr-1"/>{props.small ? "" :" Processing " + percentage}</div>
        }else{
          if( typeof(progress) === "object" ){
            if( progress.text ){
              progress = progress.text
            }else{
              progress = JSON.stringify(progress)
            }
          }
          title = <div className=''><FontAwesomeIcon icon='spinner' className="animate-spin mr-1"/>{props.small ? "" : progress}</div>
        }
        //action = (e)=>{e.stopPropagation();}
      }
      
    }
    return (<>
              <div
                type="button"
                className={[
                  'text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                  active ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : 
                    error ? "bg-red-100 border-red-600 text-red-800 border" : "bg-white text-gray-400"
                ].join(" ")}
                onClick={action}>
              {title}</div>
              {!active && props.showDelete &&
                <div
                  type="button"
                  className={[
                    'text-xs ml-0.5 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                     "bg-white text-gray-400"
                  ].join(" ")}
                  onClick={props.onDelete ?? promptDelete}>
                {<TrashIcon className="h-4 w-4" aria-hidden="true" />}</div>
              }
             </>)
}