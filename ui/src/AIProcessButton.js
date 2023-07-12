import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import useDataEvent from "./CustomHook";

export default function AIProcessButton({primitive, ...props}){

  useDataEvent("set_field", primitive.id)

    let title = <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
    let action = async (e)=>{
        e.stopPropagation();
        if( props.process ){
            if( props.markOnProcess ){
              console.warn("DEPRECATED")
            }
            props.process(primitive)
        }
    }
    let active = false
    let error = false
    if( primitive.processing?.ai){
        error = props.active && primitive.processing.ai[props.active]?.state === "error"
        active = !error && (props.active === undefined || primitive.processing.ai[props.active])
        if( props.subset && primitive.processing.ai[props.active]?.subset ){
          if( !primitive.processing.ai[props.active].subset.includes(props.subset)){
            active = false
          }
        }

      if( error || (new Date() - new Date(primitive.processing.ai?.[props.active]?.started)) > (5 * 60 *1000) ){
        title = <div className='text-red-600'><FontAwesomeIcon icon='triangle-exclamation'/> Error</div>
        active = false
        error = true
      }else if(active){
        title = <div className=''><FontAwesomeIcon icon='spinner' className="animate-spin"/>{props.small ? "" :" Processing"}</div>
        //action = (e)=>{e.stopPropagation();}
      }
      
    }
    return (<div
                type="button"
                className={[
                  'text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                  active ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : 
                    error ? "bg-red-100 border-red-600 text-red-800 border" : "bg-white text-gray-400"
                ].join(" ")}
                onClick={action}>
            {title}</div>)
}