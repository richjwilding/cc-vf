import { useState } from "react"
import Popup from "./Popup"

export function InputPopup(props){
    function closeModal() {
        if( props.cancel ){
            props.cancel()
        }
    }
    function confirm(){
        if( field && props.confirm){
            props.confirm( {keywords: field} )
        }
        closeModal()
    }
    const [field, setField] = useState(undefined)
    return (
        <Popup width='max-w-xl' setOpen={closeModal} title={`${props.title || "Input needed"}`}>
            {({ activeOption }) => (
                <>
                <input
                    className="block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder={props.prompt || "Search term..."}
                    value={field}
                    onChange={(e)=>setField(e.currentTarget.value)}
                />
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