import CollectionUtils from "./CollectionHelper"
import { HeroIcon } from "./HeroIcon"
import HierarchyNavigator from "./HierarchyNavigator"
import MainStore from "./MainStore"
import Panel from "./Panel"
import TooggleButton from "./ToggleButton"

export default function FilterPane(props){

    const setColFilter = ()=>{}
    const setRowFilter = ()=>{}
    const deleteViewFilter = ()=>{}
    const updateAxisFilter = ()=>{}
    const addViewFilter = ()=>{}
    const updateHideNull = ()=>{}
    const colFilter = []
    const rowFilter = []
    const axisOptions = []
    const filterPane = []
    const viewFilters = []
    const extentMap = []
    const hideNull = false
    const sets = [
        {selection: "column", mode: "column", title: "Columns", setter: setColFilter, list: colFilter},
        {selection: "row", mode: "row", title: "Rows", setter: setRowFilter, list: rowFilter},
        ...viewFilters.map((d,idx)=>({selection:  `filterGroup${idx}`, title: `Filter by ${axisOptions[d.option]?.title}`, deleteIdx: idx, mode: idx, list: d.filter}))
    ]
    sets.forEach(set=>{
        const axis = extentMap[set.selection]
        if(axis){
            filterPane.push(
                <Panel title={set.title} 
                        deleteButton={
                            set.deleteIdx === undefined
                                ? undefined
                                : (e)=>{e.preventDefault();MainStore().promptDelete({message: "Remove filter?", handleDelete:()=>{deleteViewFilter(set.deleteIdx); return true}})}
                        }
                        collapsable>
                    <>
                    <div className='flex space-x-2 justify-end'>
                        <button
                            type="button"
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            onClick={()=>updateAxisFilter(false, set.mode, true, axis)}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            onClick={()=>updateAxisFilter(true, set.mode, true, axis)}
                        >
                            Clear all
                        </button>
                    </div>
                    <div className='space-y-2 divide-y divide-gray-200 flex flex-col bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 mt-2'>
                        {axis.map(d=>{
                            return (
                            <label
                                className='flex place-items-center '>
                                <input
                                aria-describedby="comments-description"
                                name="comments"
                                type="checkbox"
                                checked={!(set.list && set.list[d.idx])}
                                onChange={()=>updateAxisFilter(d.idx, set.mode, false, axis)}
                                className="accent-ccgreen-700"
                            />
                                <p className={`p-2 ${set.list && set.list[d.idx] ? "text-gray-500" : ""}`}>{d.label}</p>
                            </label>
                            )})}
                    </div> 
                    </>
                </Panel>
            )
        }
    })
    return <>
            <div className='w-full p-2 text-lg flex place-items-center'>
                Filter
                <HierarchyNavigator noBorder icon={<HeroIcon icon='FunnelPlus' className='w-5 h-5 '/>} items={CollectionUtils.axisToHierarchy(axisOptions)} flat placement='left-start' portal action={(d)=>addViewFilter(d.id)} dropdownWidth='w-64' className='ml-auto hover:text-ccgreen-800 hover:shadow-md'/>
            </div>
            <div className='w-full p-2 text-lg overflow-y-scroll'>
                <TooggleButton title='Hide empty rows / columns' enabled={hideNull} setEnabled={updateHideNull}/>
                {filterPane}
            </div>
    </>
}