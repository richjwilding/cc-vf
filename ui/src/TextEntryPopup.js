import { useRef, useState } from "react";
import Popup from "./Popup";

export default function TextEntryPopup({mode, ...props}) {
    const [value, setValue] = useState()
    const close = ()=>{
        props.setOpen(false)
    }
    const submit = ()=>{
        close()
        props.submitted(value)
    }
    return (
        <Popup width='max-w-xl' setOpen={close}>
            {({ activeOption }) => (
            <>
            {props.title && <h3 className='w-full pb-4 text-gray-500 text-gray-500 flex place-items-center font-medium'>{props.title}</h3>}
                <textarea
                rows={5}
                tabIndex={1}
                onKeyDown={(e)=>{
                    if(e.key === "Enter"){
                        e.preventDefault()
                        submit()
                    }
                }}
                onChange={(e)=>setValue(e.currentTarget.value)}
                className="block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder={props.prompt || "Title..."}
                defaultValue={''}
              />
              {props.list && props.list.length > 0 &&
                <ul role="list" className="divide-y divide-gray-200 mt-4 rounded-md border border-gray-200 bg-gray-50">
                    {props.list.map((section)=>(
                        <div key={section.title} className=" py-3 pl-3 pr-4 text-sm text-gray-600">
                            <p key='title' className="font-light mb-1">{section.title}</p>
                            {section.items.map((d)=>(
                                <p key={d.plainId} className=" border-l-2 py-1 pl-3">{d.title} · {d.displayType} #{d.plainId}</p>
                            ))}
                        </div>
                    ))}
                </ul>
              }
                <div className="flex flex-shrink-0 justify-between space-x-2 pt-4 mt-1">
                    <button
                        type="button"
                        onClick={()=>props.setOpen(false)}
                        className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        {props.cancelText || "Cancel"}
                    </button>
                    <button
                        type="button"
                       disabled={value === undefined || value.trim().length === 0}
                        onClick={submit}
                        className="rounded-md bg-indigo-600 disabled:bg-gray-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        {props.addText || "Create"}
                    </button>
                </div>
            </>
            )}
        </Popup>
    )
}