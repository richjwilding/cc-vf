import { convertOrganizationFinancialData } from "./SharedTransforms";
import { registerAction } from "../action_helper";

registerAction( "convert_financials", undefined, (primitive, action, options, req)=>{
    if(!primitive.financialData){
        return true
    }

    const analysisTables = action.transform ?? {}

    const sections = Object.keys(analysisTables)

    let overall = convertOrganizationFinancialData( primitive, analysisTables, sections )
    return overall
})