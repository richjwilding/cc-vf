import { useState } from "react"
import Popup from "./Popup"
import { PrimitiveCard } from "./PrimitiveCard"

export function InputPopup(props){

    function closeModal() {
        if( props.cancel ){
            props.cancel()
        }
    }
    function confirm(){
        if( props.confirm){
            props.confirm( Object.keys(data).reduce((a,c,)=>{
                let value = data[c].value ?? data[c].default
                if( !value && props.fields?.[c].allowNull){
                    value = "undefined"
                }
                a[c] = value
                return a
        }, {}) )
        }
        closeModal()
    }
    const [data, setData] = useState(props.fields || {"keywords": {type: "text"}})
    const updateValue = (k,v)=>{
        const newItem = {...data}
        newItem[k] = newItem[k] || {}
        newItem[k].value = v 
        setData( newItem )
        return true
    }

    console.log( data )

    return (
        <Popup width='max-w-xl' setOpen={closeModal} title={`${props.title || "Input needed"}`}>
            {({ activeOption }) => (
                <>
                <div style={{gridTemplateColumns:'max-content auto'}} className="grid w-full gap-2 items-center">
                {Object.keys(data).map((k)=>{
                    return <>
                    <p className="text-small text-gray-500">{data[k].title}</p>
                    <PrimitiveCard.RenderItem editable local allowNone={data[k].allowNone} callback={(d)=>updateValue(k,d)} item={data[k]} primitive={props.primitive} ensurePresent types={data[k].primitiveTypes} referenceIds={data[k].referenceIds}/>
                    </>
                })}
                </div>
                    <div className="flex flex-shrink-0 justify-between space-x-2 pt-4 mt-1">
                        <button
                            type="button"
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            onClick={closeModal}
                        >
                            Cancel
                        </button>
                      <button
                        type="button"
                        className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:ml-3 sm:w-auto"
                        onClick={confirm}
                        >
                      {props.confirmText || "Go"}
                    </button>
                      </div>
            </>)}
        </Popup>
    )
}