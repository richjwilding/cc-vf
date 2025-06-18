import { ArrowPathIcon, MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/20/solid"
import MainStore from "./MainStore"
import UIHelper from "./UIHelper"
import useDataEvent from "./CustomHook"
import EditableTextField from "./EditableTextField"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

const mainstore = MainStore()

function QueryPaneInfo({primitive}){
    const asTitle = !primitive.referenceParameters.useTerms && !primitive.referenceParameters.hasOwnProperty("terms") && primitive.title

    const terms = (asTitle ? primitive.title : primitive.referenceParameters.terms) ?? ""
    const site = (primitive.referenceParameters.site) ?? ""

    const termList = terms.split(",").filter(d=>d).map(d=>d.trim())
    const siteList = site.split(",").filter(d=>d).map(d=>d.trim())

    const total = termList.length * siteList.length

    if( total < 120 ){
        return <></>
    }
    return <div className="w-full flex bg-yellow-100 text-sm font-semibold text-slate-600 place-items-center p-2 justify-center mt-2 rounded-md space-x-2">
        <FontAwesomeIcon icon="fa-solid fa-circle-info" /><p>This query will run as {total} searches</p>
    </div>
    

}

export function QueryPane({primitive, ...props}){
    useDataEvent("set_field set_parameter", primitive?.id)
    const asTitle = !primitive.referenceParameters.useTerms && !primitive.referenceParameters.hasOwnProperty("terms") && primitive.title

    const sourceOption = primitive.metadata.parameters.sources
    const sources = primitive.referenceParameters.sources ?? []
    let configParams
    let activeConfig = primitive.metadata.parameters.sources.options.find(d=>d.id === sources?.[0])?.config
    if(  activeConfig ){
        configParams = {
            sources: sourceOption,
            ...activeConfig
        }

    }
    
    return (<div className={props.terms === false ?? props.detail === false ? "" : "space-y-2"}>
                {props.terms !== false && <div className="w-full flex space-x-2 min-h-16">
                    <EditableTextField
                        editable
                        submitOnEnter={true} 
                        primitiveId={primitive.id}
                        value={asTitle ? primitive.title : primitive.referenceParameters.terms} 
                        placeholder="Search terms" 
                        border
                        fieldClassName='grow text-sm text-slate-500'
                        callback={(value)=>{
                            if( asTitle ){
                                primitive.title = value
                                return true
                            }else{
                                return primitive.setParameter("terms", value)
                            }
                        }}
                    />
                </div>}
                {props.detail !== false &&<UIHelper.Disclosure className={props.terms !== false ? "px-1" : ""}>
                    <UIHelper.Disclosure.Button small={props.terms !== false} expand="right-down">Details</UIHelper.Disclosure.Button>
                    <UIHelper.Disclosure.Panel>
                        <div className="w-full flex-col text-xs my-2 space-y-1">
                            <PrimitiveCard.Parameters primitive={primitive} activeParameters={configParams} hidden="terms" editing leftAlign inline compactList className="text-xs text-slate-500" fullList />
                        </div>
                    </UIHelper.Disclosure.Panel>
                </UIHelper.Disclosure>}
            </div>)
}

QueryPane.Info = QueryPaneInfo