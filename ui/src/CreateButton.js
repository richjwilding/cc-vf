import DropdownButton from "./DropdownButton";
import MainStore from "./MainStore";
import Panel from "./Panel";
import PrimitiveConfig from "./PrimitiveConfig";

const createResult = async( primitive, options = {})=>{
    const resultCategory = options.resultCategory ?? MainStore().category( options.resultCategoryId )
    if( !resultCategory ){
        throw "Cant add unknown primitive type"
    }
    if( options.actionFields){
        if(!options.action?.key){
            console.error("NOT IMPLEMENETED")
            return
        }
        const category = primitive.metadata.resultCategories?.find(d=>d.resultCategoryId === resultCategory.id)
        if(!category){
            throw "Cant find category type"
        }
        MainStore().setManualInputPrompt({
            primitive: primitive,
            fields: options.actionFields,
            confirm: async (inputs)=>{
            const actionOptions = {
                ...options.action,
                path: `results.${category.id}`,
                ...inputs
            }
            console.log(options.action.key , actionOptions)
            await MainStore().doPrimitiveAction(primitive, options.action.key , actionOptions)
            },
        })
        return
    }
    const type = resultCategory?.primitiveType ?? "result"

    const newObj = await MainStore().createPrimitive({
        parent: primitive,
        type: type,
        title: options.title || `New ${resultCategory.title}`,
        categoryId: resultCategory?.id,
        referenceParameters: options.referenceParameters
    })
    if(options.open && options.onPreview){
        options.onPreview( newObj )
    }

}

export default function CreateButton({parent, options,...props}){
    if(options){
        return <DropdownButton portal {...props} items={
            options.map(d=>({
                title: d.title,
                action: ()=>createResult( parent, d.options)
            }))
        }/>
    }
    return <Panel.MenuButton 
        onClick={()=>createResult( parent, props) }
        title={props.title ?? "Create new"}
    />
}