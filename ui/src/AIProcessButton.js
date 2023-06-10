import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export default function AIProcessButton({primitive, ...props}){
    let title = <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
    let action = async (e)=>{
        e.stopPropagation();
        if( props.process ){
            if( props.markOnProcess ){
              primitive.setField("ai_processing", {state: "underway", process: props.active || "unknown", started: new Date})
              const result = await props.process(primitive)
              primitive.setField("ai_processing", result ? null : {state: "error"})
              return
            }
            props.process(primitive)
        }
    }
    let disable = false
    if( primitive.ai_processing){
        const error = primitive.ai_processing.state === "error"
        disable = !error && props.active && primitive.ai_processing.process !== props.active
        const active = !error && (props.active === undefined || (props.active && primitive.ai_processing.process === props.active))

      if( error || (new Date() - new Date(primitive.ai_processing.started)) > (5 * 60 *1000) ){
        title = <div className='text-red-600'><FontAwesomeIcon icon='triangle-exclamation'/> Error</div>
      }else if(active){
        action = (e)=>{e.stopPropagation();}
        title = <div className=''><FontAwesomeIcon icon='spinner' className="animate-spin"/>{props.small ? "" :" Processing"}</div>
      }
      
    }
    return (<button
                type="button"
                disabled={disable}
                className="text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full bg-white text-gray-400 font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={action}>
            {title}</button>)
}