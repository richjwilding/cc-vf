import { useState, useMemo, useEffect, Fragment} from 'react';
import MainStore from './MainStore';
import { PrimitiveCard } from './PrimitiveCard';
import { MarkdownEditor } from './MarkdownEditor';


export default function NewPrimitivePanel({selectedCategory,...props}) {

    const mainstore = MainStore()
    const [parameters, setParameters] = useState({})
    const [showExtra, setShowExtra] = useState(false)

    useEffect(()=>{
        setParameters({})
        console.log(`resetting`)
    }, [selectedCategory?.id])
    
    const asMain = Object.keys(selectedCategory?.parameters ?? {}).filter(d=>selectedCategory.parameters[d].asMain)?.[0] ?? "title"
    console.log(asMain)


    async function submit() {
        const type = selectedCategory.primitiveType ?? [props.type].flat()[0]

        const baseParams = selectedCategory.parameters

        const defaults = Object.keys(baseParams ?? {}).reduce((a,c)=>{
            if( baseParams[c].hasOwnProperty("default") ){
                a[c] = baseParams[c].default
            }else if(baseParams[c].type === "categoryId" && baseParams[c].activeOnly){
                a[c] = props.primitiveList[0]?.referenceId
            }
            return a
        },{})

        const {title, ...others} = parameters

        const fullParameters = {
            ...defaults,
            ...props.parameters,
            ...others
        }

        if( Object.keys(baseParams ?? {}).filter(d=>baseParams[d].required).filter(d=>fullParameters[d] === undefined).length > 0){
            console.log(`Missing fields`)
            return 
        }

        const struct = {
            title: title,
            type: type,
            referenceId: selectedCategory?.id,
            referenceParameters: fullParameters,
        }
        
        if( props.newPrimitiveCallback){
            props.newPrimitiveCallback( struct )
        }

        return 
    }

    function closeModal() {
        if( props.cancel ){
            props.cancel()
        }
    }

    function validateAndSetParameter( paramaterName, paramater, value ){
        if( paramater.type === "float" ){
            if( isNaN(parseFloat(value)) ){
                return false
            }            
        }
        setParameters({
            ...parameters,
            [paramaterName]: value
        })
        return true

    }

    const paramatersToShow = [
        {key: "title", title: "Title", type: "string"},
        ...Object.keys(selectedCategory.parameters).filter(d=>!selectedCategory.parameters[d].hidden).map(d=>({key: d, ...selectedCategory.parameters[d]}))
    ]

    const mainItem = paramatersToShow.find(d=>d.key === asMain)
    const hasExtra = paramatersToShow.filter(d=>d.extra).length > 0

    return (<>
        <div className='px-2'>
            {mainItem.type === "prompt" && <MarkdownEditor 
                placeholder={props.prompt || `${mainItem?.title}...`}
                onChange={(e)=>validateAndSetParameter(asMain, mainItem, e)}
            />}
            {mainItem.type !== "prompt" && <textarea
                rows={mainItem?.type === "long_string" ? 5 : 1}
                tabIndex={1}
                onKeyDown={(e)=>{
                    if(e.key === "Enter"){
                        e.preventDefault()
                        submit()
                    }
                }}
                value={parameters[asMain] ?? ""}
                onChange={(e)=>validateAndSetParameter(asMain, mainItem, e.currentTarget.value)}
                //onChange={(e)=>setValue(e.currentTarget.value)}
                className={`block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 ${mainItem?.type === "long_string" ? "" : "resize-none"}`}
                placeholder={props.prompt || `${mainItem?.title}...`}
                defaultValue={''}
                />}
            </div>
            {selectedCategory &&  
                <div style={{gridTemplateColumns:'max-content auto'}} className='w-full px-2 py-0.5 grid grid-cols-2 mt-2'>
                    {paramatersToShow.filter(d=>d.key !== asMain && (!d.extra || (showExtra && d.extra))).map((parameter, idx)=>{
                        
                        parameter.value = parameters[parameter.key]

                        const classDef = ['flex text-sm min-h-[2rem] ', idx > 0 ? "border-t" : ""].join(" ")
                        return <Fragment key={parameter.key}>
                            <p className={`${classDef} px-2 py-2.5 place-items-center text-gray-500 items-start`}>
                                {parameter.title}
                            </p>
                            <div className={`${classDef} pl-2 py-2 place-items-center flex justify-end w-full`}>
                                <PrimitiveCard.RenderItem item={parameter} local primitiveList={props.primitiveList} localCategoryId={parameters.referenceId} primitive={props.originTask} editable={true} border callback={(e)=>{return validateAndSetParameter(parameter.key, parameter, e)}}/>
                            </div>
                        </Fragment>
                    })}
                    {hasExtra && <span className="col-span-2 mr-2 mb-1 place-self-end inline-flex items-center rounded-md bg-gray-100 hover:bg-gray-200 active:bg-gray-400 active:text-white px-2 py-1 text-xs font-medium text-gray-600" onClick={()=>setShowExtra(!showExtra)}>{showExtra ? "Less" : "More"}</span>}
                </div>}
                <div className="flex flex-shrink-0 justify-end pt-2 mt-1">
                    <button
                        type="button"
                        tabIndex='3' 
                        //disabled={value === undefined || value.trim().length === 0 || (items.length > 0 && selectedCategory === undefined)}
                        onClick={submit}
                        className="rounded-md bg-ccgreen-700 disabled:bg-gray-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-ccgreen-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        {props.addText || "Create"}
                    </button>
                </div>
        </>)
}