import MainStore from './MainStore';
import { RelationshipTable } from './RelationshipTable';
import React, { useEffect, useReducer, useState } from 'react';
import Panel from './Panel';
import {ContactPopover} from './ContactCard';
import DropdownButton from './DropdownButton';
import {
  ArrowTopRightOnSquareIcon,
  PencilIcon,
  CheckIcon,
  UserIcon,
  PaperClipIcon,
  UserPlusIcon,
  FlagIcon as SolidFlagIcon
} from '@heroicons/react/20/solid'
import { HeroIcon, SolidHeroIcon } from './HeroIcon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { EvidenceCard } from './EvidenceCard';
import { Link, useLinkClickHandler, useNavigate } from "react-router-dom";
import EditableTextField from './EditableTextField';
import EditablePersonField from './EditablePersonField';
import EditableResourceField from './EditableResourceField';
import useDataEvent from './CustomHook';
import ContactPicker from './ContactPicker';
import QuestionCard from './QuestionCard';
import CategoryCard, { CategoryCardPill } from './CategoryCard';
import {  BuildingOffice2Icon,  ChevronRightIcon,  FlagIcon,  LinkIcon,  MagnifyingGlassCircleIcon,  PlusCircleIcon,  QuestionMarkCircleIcon,  SparklesIcon,  TrashIcon } from '@heroicons/react/24/outline';
import { Bars3Icon } from '@heroicons/react/20/solid';
import ConfirmationPopup from './ConfirmationPopup';
import AIProcessButton from './AIProcessButton';
import { Menu, Popover } from '@headlessui/react';
import { Float } from '@headlessui-float/react';
import PrimitivePicker from './PrimitivePicker';
import { VFImage } from './VFImage';
import SegmentCard from './SegmentCard';
import { Grid } from  'react-loader-spinner'
import PrimitiveConfig from './PrimitiveConfig';
import MyCombo from './MyCombo';
import { InputPopup } from './InputPopup';
import TooggleButton from './ToggleButton';
import CheckPill from './CheckPill';
import SummaryCard from './SummaryCard';
import UIHelper from './UIHelper';
import CollectionUtils from './CollectionHelper';
import MarkdownEditor from './MarkdownEditor';
import { roundCurrency } from './SharedTransforms';
import { DescriptionDetails, DescriptionList, DescriptionTerm } from './@components/description-list';
import { useSmoothGradient } from './@components/SmoothGradient';

export const ExpandArrow = function(props) {
  return (
      <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path clipRule="evenodd" fillRule="evenodd" d="M15 3.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0V5.56l-3.97 3.97a.75.75 0 11-1.06-1.06l3.97-3.97h-2.69a.75.75 0 01-.75-.75zM9.53 14.47A.75.75 0 019.53 15.53L5.56 19.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75v-4.5a.75.75 0 011.5 0v2.69l3.97-3.97a.75.75 0 011.06 0z" />
      </svg>
  
  );
}

let mainstore = MainStore()

  const RenderItem = ({item, ...props})=>{
    let icon = item.icon && typeof(item.icon) === "object" && item.icon.library === "fa" && <FontAwesomeIcon icon={item.icon.icon} className='mr-1 text-slate-500'/>
      if( item.type === "boolean"){
        const thisVal = item.value !== undefined ? item.value : item.default
        if( props.editable || props.editing){
          return <TooggleButton small enabled={thisVal} setEnabled={(v)=>{
            if(props.callback){
              props.callback(v)
            }else{
              props.primitive.setParameter(item.key, v )
            }
          }}/>
        }
        return (
          <dd className="text-gray-500 font-medium self-center">{thisVal ? "Yes" : "No"}</dd>
        )
      }else if( item.type === "collection_axis"){
        const source = props.primitive?.findParentPrimitives({type: ["experiment", "activity"]})[0] ?? props.primitive?.findParentPrimitives({type: ["query", "view", "segment"]})[0]
        return <UIHelper.AxisPicker 
                    source={source} 
                    value={item.value}
                    onChange={async (d,idx)=>{
                      const path = idx === undefined ? item.key : `${item.key}.${idx}`
                      await CollectionUtils.setPrimitiveAxis(  props.primitive, d, path, false)
                    }}
                    />
      }else if( item.type === "list"){
        const align = ""
        let editable = true
        let thisValue = undefined
        if( Array.isArray(item.value)){
          if( typeof(item.value[0]) === "string" ){
            thisValue = item.value.join(", ") 
          }else{
            editable = false
            thisValue = JSON.stringify( item.value )
          }

        }

        return <EditableTextField
          {...props} 
          submitOnEnter={true} 
          editable={editable}
          value={thisValue} 
          default={item.default} 
          placeholder={item.placeholder} 
          icon={icon} 
          //fieldClassName={`${props.compact ? "" :`${align} grow`} ${props.inline ? "truncate" : ""}`}
          fieldClassName={`${props.compact ? "" :`${align} grow`}`}
          callback={props.callback ? props.callback : (value)=>{
            const asList = value.split(",").map(d=>d.trim())
            return props.primitive.setParameter(item.key, asList)
          }}
        />
      }else if( item.type === "options"){
          return <div className='flex flex-wrap space-x-2'>{item.options.map(d=><CheckPill title={d.title} enabled={item.value ? item.value.includes(d.id) : item.default?.includes(d.id)} setEnabled={(v)=>{
            let newValue = item.value ?? item.default ?? []

            if(props.callback){
              if( newValue.includes(d.id)){
                if( item.single ){
                  return
                }
                newValue = newValue.filter(d2=>d2 !== d.id)
              }else{
                if( item.single ){
                  newValue = [d.id]
                }
                newValue.push(d.id)
              }
              props.callback(newValue)
            }else{
              if( newValue.includes(d.id)){
                if( item.single ){
                  return
                }
                props.primitive.removeFromParameter(item.key, d.id )
              }else{
                if( item.single ){
                  props.primitive.setParameter(item.key, [d.id])
                }else{
                  props.primitive.addToParameter(item.key, d.id)
                }
              }
            }
          }}/>)}</div>
      }else if( item.type === "axis_parent"){
        if(!props.primitive){
          return <></>
        }
        const axis = CollectionUtils.axisFromCollection( props.items ?? [props.primitive], props.primitive )
        const hasSegments = (props.items ?? [props.primitive]).some(d=>d.parentPrimitives.find(d=>d.type === "segment"))
        
        const options = [
            {id: null, title: "None"}, 
            hasSegments ? {id:"SEGMENT", title: "Segment parent"} : undefined,
            ...axis.filter(d=>d.category && d.type === "title").map(d=>{
          return {
            id: d.relationship?.join("|"),
            title: d.category.title
          }
        })].filter(d=>d)

        return <PrimitiveCard.RenderItem 
            item={{
                value: props.primitive.referenceParameters?.[item.key]?.join("|"),
                type:"option_list",
                options
            }}
            callback={(v)=>{
              if( props.callback ){
                props.callback( v )
              }else{
                if( props.primitive && item.key){
                  props.primitive.setParameter( item.key, v === null ? null : v.split("|"), false, true  )
                }
              }
            }}
        />


      }else if( item.type === "primitive"){
        let base

        const clear=()=>{
          const picked =   props.primitive.primitives.params?.[item.key]
          if( picked ){
            props.primitive.removeRelationship(picked, `params.${item.key}`)
          }
        }

        const pick = ()=>{
          mainstore.globalPicker({
            root: undefined,
            callback:(pick)=>{
              if( props.callback ){
                props.callback( pick.id )
              }else{
                if( props.primitive){
                  props.primitive.addRelationship(pick, `params.${item.key}`)
                }
              }
            },
            type: item.primitiveType,
            referenceId: item.referenceId
            
          })
        }
        const pickedItem = props.callback ? mainstore.primitive(item.value) : props.primitive?.primitives?.params?.[item.key].allItems?.[0]
        if( pickedItem ){
          base = <div className='flex space-x-1 ml-auto'>
                    <PrimitiveCard micro primitive={pickedItem} compact onClick={pick}/>
                    <Panel.MenuButton small action={clear} title={<TrashIcon className='grow-0 w-5 h-5 mr-1'/>} className='shrink-0'/>
                  </div>
        }else{
          base = <Panel.MenuButton small action={pick} title={<div className='flex place-items-center justify-center text-gray-600 w-full'><MagnifyingGlassCircleIcon className='w-5 h-5 mr-1'/>Select item</div>} className='w-full'/>
        }
        return <div className='w-full flex '>{base}</div>
      }else if( item.type === "primitive_parent"){
        let base
        const pickedItem = props.primitive?.relationshipAtLevel(item.key,1)?.[0]
        console.log(pickedItem)
        if( pickedItem ){
          base = <PrimitiveCard primitive={pickedItem} hideCover hideDescription hideTitle />
        }else{
          base = <p>None</p>
        }
        return <div className='w-full flex'>{base}</div>
      }else if( item.type === "generatorId"){
        let list = mainstore.categories().filter(d=>d.ai?.generate)

        return <MyCombo 
          disabled={item.locked}
          selectedItem={item.value} 
          setSelectedItem={(idx)=>{
            if( props.callback ){
              return props.callback(idx)
            }else{
              if( item.key ){
                props.primitive.setParameter( item.key, idx)
              }
            }
          }}
          small={props.compact || props.inline}
          portal
          items={list.map((d, idx)=>{return {id:idx, ...d}})}
            className={props.compact ? "" : 'ml-auto w-full'}
          />
      }else if( item.type === "categoryId"){
        let list = []
        if( props.allowNone || item.allowNone){
                list.push({key: "none", title: "No items", categoryId: undefined, category: undefined})
        }

        let available = item.referenceIds ? item.referenceIds.map(d=>mainstore.category(d)) : mainstore.categories()
        let itemCountByType
        if( props.activeOnly || item.activeOnly){
          //const ids = props.primitive.primitives.descendants.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d) === i)
          if( props.primitive || props.primitiveList){
            
            const items = mainstore.uniquePrimitives((props.primitiveList ?? [props.primitive]).map(d=>{
              if(d.type === "category"){
                return d.origin
              }else if(d.type === "query"){
                return d.primitives.imports.allItems
              }
              return d
            }).flat())
            const itp = items.map(d=>d.itemsForProcessing).flat()
            let lookups = mainstore.uniquePrimitives([itp, itp.map(d=>d.primitives.directDescendants)].flat(Infinity))
            if( lookups.length > 0){

              lookups = [...items, ...lookups]
              itemCountByType = {}
              for(const d of lookups){
                itemCountByType[d.referenceId] = (itemCountByType[d.referenceId] ?? 0) + 1
              }
              const ids = lookups.map(d=>d.referenceId).flat().filter((d,i,a)=>a.indexOf(d) === i)
              available = available.filter(d=>ids.includes(d.id))
            }
          }else{
           // available = []
          }
        }
        if( item.filterForExtractor){
          available = available.filter(d=>d.ai?.extract)
        }
        
        for( const cat of available){
          if(item.referenceIds ||  ["entity","evidence","result","category","query","activity","marketsegment","detail","summary"].includes(cat.primitiveType) ){
            list.push({title: cat.title, count: itemCountByType ? itemCountByType[cat.id] : undefined,categoryId: cat.id, category: cat, icon: cat.icon})
          }
        }                

        const setSource = (idx)=>{
          const source = list[idx]

          if( props.callback ){
            const res = {}
            props.callback(parseInt(source.categoryId))
          }else{
            if( item.key ){
              props.primitive.setParameter( item.key, parseInt(source.categoryId))
            }
          }
        }


        let selectedItem = list.findIndex(d=>parseInt(item.value) === d.categoryId)
        if(props.local ){
          if( item.value === undefined && (item.activeOnly || props.activeOnly)){
            if( props.primitiveList ){                
              selectedItem = list.findIndex((d)=>(d.categoryId === props.primitiveList[0]?.referenceId))
            }
          }
        }

        return <MyCombo 
          disabled={item.locked}
          showCount={itemCountByType}
          selectedItem={selectedItem} 
          setSelectedItem={setSource}
          small={props.compact || props.inline}
          portal
          items={list.map((d, idx)=>{return {id:idx, ...d}})}
            className={props.compact ? "" : 'ml-auto w-full'}
          />
      }else if( item.type === "category_source"){
        let list = []

        if( props.allowNone){
                list.push({key: "none", title: "No items", categoryId: undefined, category: undefined})
        }

        let defaultConfig

        if( item.scope ){
          const origin = props.primitive.origin
          if( origin ){
            console.log(`SCOPE ==== ${item.scope}`)
            console.log(origin)
            let items

            const unpackItems = (items, level)=>{
                const types = items.map(d=>d.metadata).filter((d,i,a)=>a.findIndex(d2=>d && d2 && d.id === d2.id)===i)
                for( const cat of types ){
                  list.push({key: "items", target: "items", title: cat.title, categoryId: cat.id, category: cat, pivot: level > 0 ? level : undefined})
                }                
            }

            for(const scope of item.scope){
              let scopeName = scope instanceof Object ? scope.scope : scope

              if(scopeName === "resultCategories"){
                for( const cat of origin.metadata?.resultCategories ){
                  list.push({key: `results.${cat.id}`, title: cat.title, categoryId: cat.resultCategoryId, category: cat})
                }                
              }else if(scopeName === "items"){
                items = items || origin.itemsForProcessing
                unpackItems( items )
              }else if(scopeName === "parents"){
                const type_filter = scope?.types
                const seen = new Set()
                const walk = (items)=>{
                  let parents = items.flatMap(d=>d.parentPrimitives)
                  parents = parents.filter(d=>{
                    if( seen.has(d.id)){
                      return false
                    }                    
                    seen.add(d.id)
                    return true
                  })
                  
                  return mainstore.uniquePrimitives( type_filter ? parents.filter(d=>type_filter.includes(d.type)) : parents )
                }
                let parents = walk( items )
                let level = 1
                while( parents.length > 0){
                  unpackItems( parents, level )
                  parents = walk( parents )
                  level++
                }
              }
            }
          }
        }else{
          

          const task = props.primitive.task
          if( !task?.metadata){
            return <></>
          }
          
          defaultConfig = task.metadata.actions.find((d)=>d.key === "categorize" || d.command === "categorize")
          
          
          const evidenceCategories = [task.metadata.evidenceCategories, task.primitives.descendants.filter((d)=>d.type === "evidence").map((d)=>d.referenceId)].flat().filter((c,idx,a)=>c && a.indexOf(c)===idx)
          
          evidenceCategories.forEach((d)=>{
            const cat = mainstore.category(d)
            const title = (props.excludeResultCategories ? "" : "Evidence: ") + cat.title
            if( !props.ensurePresent || task.primitives.descendants.filter((d2)=>d2.referenceId === d).length > 0 ){
              list.push({key: d, isEvidence: true, target: cat.primitiveType ?? "evidence", title: title, categoryId: cat.id, category: cat})
            }
          })
          if(task?.metadata?.resultCategories){
            task.metadata.resultCategories?.forEach((d)=>{
              const cat = mainstore.category(d.resultCategoryId)
              if( props.local ){
                list.push({key: cat.id, title: cat.title, category: cat})
                
              }else{
                list.push({key: `results.${d.id}`, title: d.title, categoryId: cat.id, category: cat})
              }
            })
          }
        }
          

        if( props.types ){
          list = list.filter(d=>!d.category || props.types.includes(d.category.primitiveType))
        }
        
        if( props.referenceIds ){
          list = list.filter(d=>props.referenceIds.includes(d.category?.id))
        }

        const setSource = (idx)=>{
          const source = list[idx]
          const fieldKey = Object.keys(props.primitive.metadata.parameters).filter((d,idx,a)=>props.primitive.metadata.parameters[d].type === "category_field")?.[0]


          if( props.callback ){
            const res = {}
            props.callback(parseInt(source.key))
          }else{
            if( source.target ){
              props.primitive.setParameter("referenceId", source.categoryId  )
              props.primitive.setParameter("pivot", source.pivot ?? 0, false, true  )
              props.primitive.setParameter(item.key, source.target )
            }else{
              props.primitive.setParameter(item.key, source.key )
            }
            if( fieldKey ){
              props.primitive.setParameter( fieldKey, 'title' )
            }
          }
        }
        let index 
        if( item.scope ){
            index = list.findIndex((d)=>(d.target === item.value && props.primitive.referenceParameters.referenceId === d.categoryId))
        }else{

          if( props.local ){
              index = list.findIndex((d)=>(d.key === item.value))
          }else{
            index = list.findIndex((d)=>(item.value === "evidence" && d.key === props.primitive.referenceParameters?.referenceId) ||(item.value === "evidence" && props.primitive.referenceParameters?.referenceId === undefined) || item.value === d.key) 
            if( index == -1 ){
              index = list.findIndex((d)=>item.value !== "evidence" && d.categoryId === props.primitive?.referenceParameters?.referenceId)
            }
            if( index == -1 && defaultConfig){
              index = list.findIndex((d)=>(defaultConfig.target === "evidence" && d.key === defaultConfig.referenceId) || defaultConfig.target === d.key) 
            }
          }
        }

        return <MyCombo 
          disabled={item.locked}
          selectedItem={index} 
          setSelectedItem={setSource}
          items={list.map((d, idx)=>{return {id:idx, ...d}})}
            className='ml-auto w-full'
          />

      }else if( item.type === "state"){
        const stateInfo = PrimitiveConfig.stateInfo[props.primitive?.type] || PrimitiveConfig.stateInfo["default"]
        const options = Object.keys(stateInfo).map((d)=>{return {id: d, ...stateInfo[d]}})

        if( props.editing || props.editable ){
          const setState = (id)=>{
            if(props.primitive){
              props.primitive.setParameter("state", id )
            }
          }

          return <MyCombo 
            selectedItem={props.primitive?.referenceParameters?.state ?? "open"} 
            setSelectedItem={setState}
            items={options}
            className='ml-auto w-full'
            />
        }else{
          const state = stateInfo[props.primitive?.referenceParameters?.state ?? "open"]
          return <div className={
            `text-xs bg-${state.colorBase}-100 h-fit whitespace-nowrap truncate rounded-full px-1.5 py-0.5 text-${state.colorBase}-800`}>
              {state.title}
            </div>
        }


      }else if( item.type === "phase"){
        if( props.primitive.type !== "assessment"){
          return <></>
        }
        const framework = props.primitive.framework        
        const options = Object.keys(framework.phases).map((d)=>{return {id: parseInt(d), ...framework.phases[d]}})
        console.log(props.primitive.referenceParameters?.phase)

        const setFramework = (id)=>{
          props.primitive.setParameter("phase", id )
        }

        return <MyCombo 
          selectedItem={parseInt(props.primitive.referenceParameters?.phase)} 
          setSelectedItem={setFramework}
          items={options}
          className='ml-auto'
          />

      }else if( item.type === "category_field"){
        const task = props.primitive?.task

        const defaultConfig = item.itemMeta ? undefined : task?.metadata?.actions.find((d)=>d.key === "categorize" || d.command === "categorize")
        let sourceMeta

        let _target = props.primitive?.referenceParameters?.target ? props.primitive.referenceParameters?.target : defaultConfig?.target
        let _refId =  props.primitive?.referenceParameters?.referenceId ?? defaultConfig?.referenceId

        
        if( props.localCategoryId){
          sourceMeta = mainstore.category(props.localCategoryId)
        }else if( props.primitive?.referenceParameters?.referenceId){
          sourceMeta = mainstore.category(props.primitive.referenceParameters?.referenceId)
        }else if( item.itemMeta ){
          if( props.primitive ){
            let list = props.primitive?.itemsForProcessing
            if( list.length === 0 && props.primitive.flowElement){
              list = props.primitive?.primitives.config.allItems.flatMap(d=>d.itemsForProcessing[0])
            }
            if( list[0]){
              sourceMeta = list[0].metadata
            }
          }
        }else if(_target === "evidence" || _target === "items"){
          sourceMeta =  mainstore.category(_refId) 
        }else if(_target === "origin"){
          sourceMeta = props.primitive.origin
        }else if(task && _target?.slice(0,7) === "results"){
          sourceMeta = mainstore.category(task.metadata?.resultCategories[_target.slice(8)].resultCategoryId)
        }else{
          sourceMeta = mainstore.category(_refId)
        }

        const list = [{
          key: "title", title: "Title"
        }]
        if( sourceMeta?.parameters ){
          Object.keys(sourceMeta.parameters).forEach((d)=>{
            const param = sourceMeta.parameters[d]
            if( (param.type === "url" ||param.type === "markdown" || param.type === "string" || param.type === "long_string" || param.type === "list") && !param.hidden){
              list.push({key: `param.${d}`, title: param.title})
            }
          })
        }

        if( item.includeContext){
          list.push({key: "context", title: "Context"})
        }
        if( item.includeContent){
          list.push({key: "full_content", title: "Content"})
        }

        let index = list.findIndex((d)=>item.value === d.key)
        if( index === -1 ){
         // index = list.findIndex((d)=>defaultConfig.field === d.key)
        }

        const setField = (idx=>{
          const field = list[idx]
          if( props.callback ){
            props.callback(field.key)
          }else{
            props.primitive.setParameter(item.key, field.key, undefined , true)
          }
        })

        return <MyCombo 
          selectedItem={index} 
          disabled={item.locked}
          small={props.inline}
          setSelectedItem={setField}
          items={list.map((d, idx)=>{return {id:idx, ...d}})}
            className={props.leftAlign ? '' : 'ml-auto'}
          />

      }else if( item.type === "flag"){
        if( props.editing || props.editable ){
        }
        return <div className={`w-full relative justify-end flex ${props.editing ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
            onClick={props.editing  ? ()=>props.primitive.setParameter(item.key, item.value ? undefined : true)  : undefined}
          >
          {item.value ? <SolidFlagIcon className={`w-5 h-5 ${`text-${item.color}-400` || 'text-red-400'}`}/> : <FlagIcon className={`w-5 h-5 ${`text-${item.color}-400` || 'text-red-400'}`}/>}
          </div>
      }else if( item.type === "link"){
        return <EditableResourceField
                {...props} 
                onSelect={(value)=>{
                    return props.primitive.setParameter(item.key, value ? value : null)
                }}
                  value = {item.value}
            />
      }else if( item.type === "user"){
        let user = mainstore.user( item.value )
        return <EditablePersonField 
                {...props} 
                key={user ? user.id : "user"}
                mode = "user"
                value ={user} 
                onSelect={async (value)=>{
                  await props.primitive.setParameter(item.key, value ? value.id : null)
                }}
                className={`flex place-items-center ${props.inline ? "truncate" : ""} ${props.secondary ? "text-slate-400 text-xs font-medium" : `text-gray-${item.value ? "500" : "400"}  font-medium`}`}
              />

      }else if( item.type === "scale" || item.type === "progress" || item.type === "range"){
        if( props.editing || props.editable || item.type === "range"){
          let value = (item.value ?? item.minValue ?? 0)
          if( item.asPercent ){
            value = value * 100
            if( item.invert){
              value = 100 - value
            }
          }
          return (
                  <input type="range" 
                    min={item.minValue ?? 0} 
                    max={item.maxValue ?? 9}
                    defaultValue={ value }
                    step={item.stepValue ?? 1}
                    className="range" 
                    onChange={(e)=>{
                      let value = e.currentTarget.value
                      if( item.asPercent ){
                        value = value / 100
                        if( item.invert){
                          value = 1 - value
                        }
                      } 
                      if( props.callback ){
                        props.callback(value)
                      }else{
                        props.primitive.setParameter(item.key, value)
                      }
                    }}/>
          )
        }
        const size = item.type === "scale" ? "w-6 h-6" : "w-8 h-8"
        const r = item.type === "scale" ? 19.2 : 25.6  
        const length = 3.14 * r 
        const thickness = item.type === "scale" ? 4 : 6
        const perc = parseInt(item.value) / 9
        const array = length * (1 - perc)
        const color = item.color || (["#f472b6","#f87171","#fbbf24","#22d3ee","#4ade80"][Math.floor(perc * 5)] ?? "#4ade80")
          return <div className='ml-auto relative'>
              <svg className={size}>
                <circle cx='50%' cy='50%' r='40%' fill='none' stroke={perc === 1 ? color : '#dedede'} strokeWidth={thickness}/>
                {perc < 1 && <circle className='origin-center	-rotate-90' cx='50%' cy='50%' r='40%' fill='none' stroke={color} strokeWidth={thickness} strokeDashoffset={array} strokeDasharray={length}/>}
              </svg>
              {item.type === "scale" && <p className='top-0 left-0 absolute text-center font-sm pt-0.5 w-full' style={{color: color}}>{item.value}</p>}
          </div>
      }else if( item.type === "internal_parent_pin"){
        let options = []
        let current = ""
        const page = props.primitive?.origin
        if( page ){
            const pins = page.inputPins 
            options = Object.keys(pins).map(d=>({id: d, title: pins[d].name})).filter(d=>d.id !== "impin")

            const outputs = page.primitives.outputs
            current = Object.keys(outputs).find(d=>outputs[d].includes( props.primitive.id ))?.split("_")?.[0]
        }

        return <PrimitiveCard.RenderItem 

            item={{
                value: current,
                type:"option_list",
                options
            }}
            callback={(v)=>{
                const outputs = page.primitives.outputs
                const existing = Object.keys(outputs).find(d=>outputs[d].includes( props.primitive.id ))
                const newPath = `${v}_impin`
                if( existing !== newPath ){
                  page.removeRelationship(props.primitive,`outputs.${existing}`)
                  page.addRelationship(props.primitive, `outputs.${newPath}`)
                }
            }}
        />

      }else if( item.type === "actionlist"){
        const actions = props.primitive?.referenceParameters?.referenceId ? mainstore.category(props.primitive?.referenceParameters?.referenceId).actions ?? [] : []
        return (<MyCombo 
                  items={actions.map(d=>({id: d.key, title: d?.title}))}
                  selectedItem={item.value}
                  className={props.leftAlign ? '' : 'ml-auto'}
                  small={props.inline}
                  setSelectedItem={props.callback
                      ? (d)=>props.callback(d) 
                      : (d)=>{
                        return props.primitive.setParameter(item.key, d)
                      }}

                />)
      }else if( item.type === "option_list"){
        return (<MyCombo 
                  items={item.options.map((d)=>{return (typeof(d) === "object" && d !== null) ? d : {id: d, title: d}})}
                  selectedItem={item.value}
                  multiple={props.primitive?.metadata?.parameters?.[item.key]?.multi}
                  className={props.leftAlign ? '' : 'ml-auto'}
                  small={props.inline}
                  setSelectedItem={props.callback
                      ? (d)=>props.callback(d) 
                      : (d)=>{
                        return props.primitive.setParameter(item.key, d)
                      }}

                />)
      }else if( item.type === "contactName"){
        const contact = props.primitive.referenceParameters.contact
        if( props.compact ){
          icon = <UserIcon className='w-5 h-5 pr-0.5 text-slate-200'/> 
          let name = contact?.name || item.value
          return <div 
            className={`flex ${props.inline ? "truncate" : ""} ${props.secondary ? "text-slate-400" : ""}`}
          >{icon}{name}</div>
        }
      }else if( item.type === "contact"){
        const contact = item.value || props.primitive?.referenceParameters.contact
        if( props.compact ){
          icon = <UserIcon className='w-5 h-5 pr-0.5 text-slate-200'/> 
          if( typeof(contact) === "object" ){
            //icon = <ContactPopover icon={<UserIcon className='w-5 h-5 text-blue-200 hover:text-blue-400'/>} contactId={contact?.id}/>
            icon = <ContactPopover contact={contact}/>
          }
          let name = contact?.name || item.value || item.default
          return <div className='flex space-x-1'>{icon}<p className={`ml-1 ${props.inline ? "truncate" : ""}`}>{name}</p></div>
        }
        return <EditablePersonField 
                {...props} 
                value ={ typeof(contact) === "object" ? contact : ""  } 
                key={contact ? contact.id : "contact"}
                onSelect={async function(value){
                  console.log( value)
                  if( value && value.id === undefined ){
                    value = await MainStore().createContact(value)
                    if( value.id === undefined){
                      console.warn(`Couldnt add new contact ${value}`)
                      return
                    }
                    console.log(`got new id ${value.id}`)
                  }
                  return props.primitive.setParameter("contactId", value ? value.id : null )
                }}
                className={`flex place-items-center ${props.inline ? "truncate" : ""} ${props.secondary ? "text-slate-400 text-xs font-medium" : `text-gray-${item.value ? "500" : "400"}  font-medium`}`}
              />
      }else if( item.type === "currency" && !props.editing){
        let val = item.value
        let unit = ""
        if( val > 1000 ){
          val = val / 1000
          unit = "K"
        }
        if( val > 1000 ){
          val = val / 1000
          unit = "M"
        }
        return <div className='ml-auto flex mt-0.5 place-items-center'>
              {item.key === "funding" && <HeroIcon icon="BanknotesIcon" className='w-4 h-4 mr-1'/>}
              {item.key === "valuation" && <HeroIcon icon="ArrowTrendingUpIcon" className='w-4 h-4 mr-1'/>}
                <p>${(val || 0).toFixed(2)}{unit}</p>
              </div>
      }else if( item.type === "markdown"){
        return <MarkdownEditor 
                  initialMarkdown={item.value} 
                  onChange={props.callback ? props.callback : (value)=>{
                      return props.primitive.setParameter(item.key, value, undefined, item.forceUpdate)
                  }}
          />
      }else if( item.type === "prompt"){
        return <MarkdownEditor 
                  initialMarkdown={item.value} 
                  onChange={props.callback ? props.callback : (value)=>{
                      return props.primitive.setParameter(item.key, value, undefined, item.forceUpdate)
                  }}
          />
      }else if( item.type === "url"){
        const url = item.value?.trim()?.startsWith("http") ? item.value.trim() : `https://${item.value?.trim()}`
        if( props.minor ){
          return (
              <a className='flex space-x-2' href={url} target="_blank">
                <LinkIcon className='w-3'/>
                <p className='break-all'>{item.value}</p>
              </a>
            )
        }
        return (
          <div className='ml-auto flex place-items-start space-x-2 w-full'>
          <EditableTextField
            {...props} 
            submitOnEnter={true} 
            value={item.value} 
            default={item.default} 
            placeholder={item.placeholder} 
            icon={icon} 
            border={props.border ?? true}
            fieldClassName={`break-all grow  ${props.inline ? "truncate" : ""}`}
            callback={props.callback ? props.callback : (value)=>{
                return props.primitive.setParameter(item.key, value)
            }}
          />
            <a href={url} className='p-1' target="_blank">
                <LinkIcon className='w-5'/>
              </a>
            </div>
            )

      }

      const align = (props.leftAlign || item.type === "long_string") ? "" : "text-end"
      const clamp = item.type === "long_string" && !props.disableClamp ? "line-clamp-[10]" : ""
      
      if(item.value instanceof Object){
        if( Array.isArray(item.value)){
          item.value = JSON.stringify( item.value)

        }else{
          return <div className='grid grid-cols-2 w-full' style={{gridTemplateColumns:"min-content auto"}}>
                {Object.keys(item.value).map(d=>{
                  return <>
                    <div className='p-1 border-b broder-gray-200'>{d}</div>
                      <EditableTextField
                        {...props} 
                        submitOnEnter={true} 
                        value={item.value[d]} 
                        callback={props.callback ? props.callback : (value)=>{
                          return props.primitive.setParameter(`${item.key}.${d}`, value, false, true)
                        }}
                        fieldClassName='border-b broder-gray-200'
                        />
                  </>
                })}
              </div>
        }
      }

      return <EditableTextField
        {...props} 
        submitOnEnter={true} 
        primitiveId={props.primitive?.id}
        value={item.value} 
        formatter={(item.type === "currency" || item.type === "funding") ? (v)=>roundCurrency(v) : undefined}
        default={item.default} 
        placeholder={item.placeholder} 
        icon={icon} 
        border={props.border ?? true}
        //fieldClassName={`${item.type === "long_string" ? "min-h-24" : ""} ${props.compact ? "" :`${align} grow`} ${props.inline ? "truncate" : ""}`}
        fieldClassName={`${item.type === "long_string" ? "min-h-16" : ""} ${props.compact ? "" :`${align} grow`}`}
        clamp={clamp}
        callback={(value)=>{
            if( item.type === "integer" || item.type === "number"){
              value = parseInt( value )
            }
            if(props.callback){
              return props.callback(value)
            }
            return props.primitive.setParameter(item.key, value)
        }}
      />

  }

  const CardMenu = function({primitive,...props}){
    const [showDeletePrompt, setShowDeletePrompt] = React.useState(false)
    const [manualInputPrompt, setManualInputPrompt] = React.useState(false)
    const navigate = useNavigate();
    const buttonClass = `${props.size > 6 ? 'p-1' : 'p-0.5'} shrink-0 grow-0 self-center rounded-md border ${props.bg === "transparent" ? "border-transparent hover:border-gray-300 hover:bg-white hover:shadow-sm" : `border-gray-300 ${props.bg || "bg-white"} shadow-sm`} font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`

    const buttonIcon = props.icon ?? <Bars3Icon className='w-full h-full'/> 

    const handleDelete = ()=>{
      mainstore.removePrimitive( primitive )
      setShowDeletePrompt( null )
    }

    let items = (props.custom || [])
    if( primitive ){

      items = items.concat([
        {
          title: 'Show in sidebar',
          action: ()=>mainstore.sidebarSelect(primitive),
          icon: ArrowTopRightOnSquareIcon
        },
        {
          title: 'Open page',
          action: ()=>navigate(`item/${primitive.id}`),
          icon: ArrowTopRightOnSquareIcon,
          skip: props.showVisitPage === undefined ? false : !props.showVisitPage
        },
        {
          title: 'Delete',
          action: ()=>setShowDeletePrompt(true),
          icon: TrashIcon,
          skip: (props.relatedTo && !((props.relatedTo && props.showDelete === 'origin' && primitive.origin.id === props.relatedTo.id)) || (props.showDelete === undefined ? false : (props.showDelete === true)))
        },
        {
          title: `Unlink from ${props.relatedTo?.displayType}`,
          action: ()=>props.relatedTo.removeRelationship(primitive, props.relatedTo.metadata.isAggregation ? "" : "outcomes"),
          icon: TrashIcon,
          skip: (props.showUnlink === false || props.showUnlink === undefined) ? true : (props.relatedTo === undefined ) || (props.relatedTo && props.relatedTo.id === primitive.origin.id) || !(props.relatedTo && props.relatedTo?.primitives.includes(primitive))
        }
        
      ]).concat(
        primitive.metadata?.actions
        ? primitive.metadata.actions.filter((d)=>d.menu).map((d)=>{
          return {
            title: d.title, 
            icon: d.icon || "PlayIcon", 
            action: async ()=>{
              if( d.manualFields ){
                setManualInputPrompt({
                  confirm: async (inputs)=>await MainStore().doPrimitiveAction(primitive, d.key, inputs, props.callbackProcessor),
                })
              }else if( d.actionFields ){
                setManualInputPrompt({
                  primitive: primitive,
                  fields: d.actionFields,
                  confirm: async (inputs)=>await MainStore().doPrimitiveAction(primitive, d.key, inputs, props.callbackProcessor),
                  //confirm: async (inputs)=>console.log(inputs),
                })
              }else{
                const res = await MainStore().doPrimitiveAction(primitive, d.key, undefined, props.callbackProcessor)
              }
            }}})
            : [] 
            ).filter((d)=>!d.skip)
          }
            const baseColor = props.color || "gray"
            
            
            return(<>
      {manualInputPrompt && <InputPopup cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
      {showDeletePrompt && <ConfirmationPopup message={`This will also delete all items that belong to this ${primitive.displayType}`} title="Confirm deletion" confirm={handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
      <div className={[`h-${props.size || 8} w-${props.size || 8}`, 'shrink-0', props.className].join(" ")}>
        <Menu>
          {({open})=>(<>
          {!open && <Menu.Button key={`b-${open}`} onClick={(e)=>e.stopPropagation()} className={buttonClass}>{buttonIcon}</Menu.Button>}
          {open && <Float portal placement='bottom-end'>
              <Menu.Button key={`b-${open}`} onClick={(e)=>e.stopPropagation()} className={buttonClass}>{buttonIcon}</Menu.Button>
              <Menu.Items className={`absolute z-10 p-1 mt-2  origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none right-0 w-min`}>
                <div className="py-1">
                  {items.map((item,idx) => (
                    <Menu.Item>
                    {({ active }) => (
                      <a
                        href={item.href}
                        key={idx}
                        onClick={(e)=>{e.stopPropagation();item.action && item.action()}}
                        className={[
                          active ? `bg-${baseColor}-100 text-${baseColor}-900` : `text-${baseColor}-700 bg-${props.colorKey ? `${baseColor}-50` : 'white' }`,
                          props.colorKey ? 'my-2 mx-1 rounded-md' : '',
                          'flex place-items-center space-x-2 px-2 py-1 text-sm'
                        ].join(" ")}
                      >
                        {item.icon && (item.icon.render || item.icon instanceof Function) && <item.icon aria-hidden="true" className='w-6 h-6'/>}
                        {item.icon && typeof(item.icon)==="string" && <HeroIcon icon={item.icon} aria-hidden="true" className='w-6 h-6'/>}
                        <p className='whitespace-nowrap'>{item.title}</p>
                      </a>
                    )}
                    </Menu.Item>
                  ))}                  
                </div>
            </Menu.Items>
          </Float>}
          </>
          )}
      </Menu>
    </div>
    </>)

  }
  


const Resources = function({primitive, ...props}){
  let resources = primitive.resources
  if( resources === undefined ){return <></>}
  return (
      <div className="sm:col-span-2">
      <dt className="text-sm font-medium text-gray-500">Attachments</dt>
      <dd className="mt-1 text-sm text-gray-900">
        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {resources.map((resource) => (
            <li
              key={resource.title}
              className="flex items-center justify-between py-3 pl-3 pr-4 text-sm"
            >
              <div className="flex w-0 flex-1 items-center">
                <PaperClipIcon className="h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden="true" />
                <span className="ml-2 w-0 flex-1 truncate">{resource.title}</span>
              </div>
              <div className="ml-4 flex-shrink-0">
                <a href={resource.url} target="_blank" className="font-medium text-blue-500 hover:text-blue-600">
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </dd>
    </div>
  )
}

const EvidenceHypothesisRelationship = function({primitive, ...props}){
  useDataEvent('relationship_update',primitive.id)
  let h = primitive.parentPrimitives.filter((p)=>p.type==='hypothesis')

  let relationships =  [
      {
          key: "candidate",
          title: "Candidate",
          icon: "QuestionMarkCircleIcon",
          bgColor: 'blue-100',
          textColor: 'blue-600',
          items: h.filter((d)=>{
            const res = primitive.parentRelationship(d)
            return res.includes("candidate")
          })
      },
      {
          key: "negative",
          title: "Negative",
          icon: "HandThumbDownIcon",
          bgColor: 'amber-100',
          textColor: 'amber-600',
          items: h.filter((d)=>{
            const res = primitive.parentRelationship(d)
            return res.includes("negative")
          })
      },
      {
          key: "positive",
          title: "Positive",
          icon: "HandThumbUpIcon",
          bgColor: 'green-100',
          textColor: 'green-500',
          items: h.filter((d)=>{
            const res = primitive.parentRelationship(d)
            return res.includes("positive")
          })
      }
  ]

  const updateRelationship = (item, set)=>{
    let to
    let current = primitive.parentPaths(item.id).find((d)=>["candidate","positive","negative"].includes(d.split(".").pop()))
    if( current){
      const root = current.split(".")
      root.pop()
      root.push( set.key )
      const to = root.join(".")
      item.moveRelationship(primitive, current === "" ? null : current, to)
    }

  } 

  return <RelationshipTable updateRelationship={updateRelationship} title={props.title === false ? false : props.title || 'Significance'} relationships={relationships}/>
}
const Relationships = function({primitive, ...props}){
    let temp = primitive.parentPrimitiveRelationships
    let map = primitive.metadata?.relationships 
    if( map == undefined ){return <></>}
    let relationships = Object.keys(map).map((k)=>{
      return {
        key: k,
        items: temp[k] || [],
        ...map[k]
      }
    })
    return <RelationshipTable title={props.title === false ? false : props.title || 'Significance'} relationships={relationships}/>
}
const Users = function({primitive, ...props}){
  const [editing, setEditing] = React.useState(props.editing)
  const [addUser, setAddUser] = React.useState(false)


  useEffect(()=>{
    setEditing(props.editing)
  }, [primitive.id, props.editing])

  let userContent
  if( props.asTable ){
    userContent = (
      <dl className="mt-2 mx-2 divide-y divide-gray-200 border-t border-b border-gray-200">
        {!editing && primitive.users.length === 0 &&
          <p className='py-3 text-center text-gray-400 text-sm'>Nothing to show</p>
        }
        {primitive.users.map((user)=>(
          <div key={user.email} className="flex justify-between py-3 text-sm relative place-items-center">
            <dt>{user.name}</dt>
              <img
                className="inline-block h-7 w-7 rounded-full right-0 absolute"
                referrerPolicy="no-referrer"
                src={user.avatarUrl}
                alt={user.name} />
          </div>
        ))}
        {editing &&
          <div key='adduser' className="flex justify-between py-3 text-sm relative place-items-center">
            <dt className='text-transparent'>Add user</dt>
              <UserPlusIcon
                onClick={()=>setAddUser(true)}
                className="inline-block h-7 w-7 p-1 rounded-full bg-gray-300 hover:bg-gray-500 text-white right-0 absolute"
                />
          </div>}
      </dl>
    )
  }else{
    userContent = 
    <div className={`flex space-x-2 ${props.className || 'mt-2 mx-2'}`}>
        {!editing && primitive.users.length === 0 &&
          <p className='w-8 h-8 justify-center place-items-center flex rounded-full text-gray-300 bg-gray-100 border border-gray-300 text-md'><UserIcon/></p>
        }
        {primitive.users.map((user) => (
          <a key={user.email} href={user.href} className="rounded-full hover:opacity-75">
            <img
              className="inline-block h-8 w-8 rounded-full"
              referrerPolicy="no-referrer"
              src={user.avatarUrl}
              alt={user.name} />
          </a>
        ))}
       </div>

  }
  if( props.hideTitle){
    return userContent
  }

  return (<>
    <Panel {...props} title={props.title || "Team"} editToggle={setEditing} editing={editing} hideTitle={props.hideTitle} >
      {userContent}
      {addUser && <ContactPicker allowNew={false} setOpen={()=>setAddUser(false)} callback={(d)=>primitive.users.find((c)=>c.id === d.id) ? primitive.removeUser(d) :  primitive.addUser(d)} mode="user"/>}
    </Panel>
  </>)
}

const Banner = function({primitive, ...props}){
  let metadata = primitive.metadata
  return (
    <div className={`flex items-center space-x-2 xs:space-x-5 ${props.className || ""}`}>
      {metadata &&
        <div className="flex-shrink-0">
          {metadata && <div className="relative">
              <HeroIcon icon={metadata.icon} className={`${props.small ? "w-12 h-12" : "w-12 h-12 md:w-20 md:h-20"}`}/>
          </div>}
        </div>
      }
      <div className='flex-grow w-full'>
        <h1 className={`flex place-items-center text-lg ${!props.small && "md:text-2xl"} font-bold text-gray-900`}><p className='hidden xs:inline'>#{primitive.plainId} {primitive.title}</p>
          {props.showLink &&
            <button
                type="button"
                className="ml-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Link to={`/item/${primitive.id}`}><ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" /></Link>
            </button>}
        </h1>
        {!props.small && metadata && <div className="text-xs md:text-sm font-medium text-gray-500">{metadata.title}<p className='hidden xs:inline'> - {metadata.description}</p></div>}
      </div>
      {props.showMenu &&
        <CardMenu primitive={primitive} showVisitPage={false} size='12' bg='transparent'/>
      }
      {props.showStateAction &&
              <DropdownButton colorKey='colorBase' items={mainstore.stateInfo[primitive.type]} selected={primitive.state}/>
      }
    </div>
  )
}
const Parameters = function({primitive, ...props}){

  const [eventTracker, updateForEvent] = React.useReducer( (x)=>x+1, 0)
  const callbackId = React.useRef(null)

  React.useEffect(()=>{
    if( !props.noEvents ){
      callbackId.current = mainstore.registerCallback(callbackId.current, "parameter_update set_parameter", updateForEvent, primitive.id )
      return ()=>{
        mainstore.deregisterCallback(callbackId.current )
      }
    }
  }, [])

  let parameters = props.activeParameters ?? (primitive.metadata?.parameters || PrimitiveConfig.metadata[primitive.type]?.parameters)


  if( props.showParents ){
    parameters = undefined
    if( primitive.origin && primitive.origin.childParameters){
      parameters = primitive.origin.childParameters
    }else if( primitive.task && primitive.task.itemParameters?.[primitive.referenceId]){
      parameters = primitive.task.itemParameters[primitive.referenceId]
    }
  } 
  let source = primitive.referenceParameters 
  
  if( !parameters ){ return <></> }
  let fields = Object.keys(parameters).sort((a,b)=>(parameters[a].order === undefined ? 99 : parameters[a].order ) - (parameters[b].order === undefined ? 99 : parameters[b].order) )
  if( props.fields ){
    let remap = props.fields.reduce((o,f)=>{
      if( f instanceof Object){
        o = {...o,...f}
        Object.keys(f).forEach((k)=>{
          parameters[k].type = f[k]
        })
      }else{
        o[f] = f
      }
      return o
    },{})
    let keyNames = Object.keys(remap)
    fields = fields.filter((f)=>keyNames.includes(f))
  }
  if( primitive.metadata?.autoParam){
    fields = fields.concat( Object.keys(primitive.referenceParameters) ).filter((d,i,a)=>a.indexOf(d) === i) 
  }
  fields = fields.filter((d)=>!parameters[d]?.hidden)
  if( props.hidden ){
    const hide = [props.hidden].flat()
    fields = fields.filter((d)=>!hide.includes(d))
  }
  
  let details = fields.map((k)=>{
    let config = parameters[k]
    if( !config ){
      if( Array.isArray(source[k]) ){
        return {type: "string", title: `${k} (auto)`, value: source[k].length + " items\n" + JSON.stringify(source[k]), key: k}
      }else  if( typeof(source[k]) === "object" ){
        return {type: "string", title: `${k} (auto)`, value: source[k], key: k}
      }else{
        return {type: "string", title: `${k} (auto)`, value: source[k], key: k}
      }
    }
    let val 
    let parts = k.split(".")
    if( parts.length == 1 ){
      val = source[k]
    }else{
      let node = source
      let last = parts.pop()
      for( const d of parts){
        if( node ){
          node = node[d]
        }
      }
      val = node?.[last]
    }
    if( val === undefined && config.default){
      val = config.default
    }
    return {...config, value: val, autoId: source[`${k}Id`], key: k}
  })
    
  details = details.filter((item)=>{
    if( item.condition){
      const pass = Object.keys(item.condition).reduce((a,c)=>{
        let cVal =  item.condition[c] 
        let invert = false
        if( cVal[0] === "!"){
          cVal = cVal.slice(1)
          invert = true
        }
        const r = primitive.referenceParameters?.[c] === cVal
        return a && (r ^ invert)
      }, true)
      return pass
    }
    return true
  }) 

  if( props.fullList ){
    if( !props.showExtra ){
      details = details.filter((item)=>item.value || !item.extra) 
    }
  }else{
    details = details.filter((item)=>item.value !== undefined || item.default || item.type === "primitive_parent") 
  }


  if( details.length === 0 ){
    return <></>
    return <p className='py-3 text-center text-gray-400 text-sm'>Nothing to show</p>
  }

  let potentialTarget = fieldsBeingProcessed(primitive)

  if( props.showTitles !== false && !props.includeTitle){
          return <DescriptionList inContainer={true}>
            {details.map((item, idx)=>(
              <>
              <DescriptionTerm  inContainer={true}>
                  {(props.showTitles === undefined || props.showTitles === true) && <p className={`pl-1 py-1 mr-2 shrink-0 grow-0 ${props.showAsSecondary ? "text-xs" : ""}`}>{item.title}</p>}
                </DescriptionTerm>
                <DescriptionDetails inContainer={true}>
                  {potentialTarget && potentialTarget.includes(`referenceParameters.${item.key}`)
                    ? <div className='w-full p-3.5 bg-gray-100 rounded animate-pulse'/>
                    : <RenderItem editing={props.editable ?? true}  editable={props.editable ?? true} primitive={primitive} items={props.items} compact={props.compact || props.compactList} leftAlign={props.leftAlign} showTitles={props.showTitles} item={item} inline={props.inline} secondary={(props.inline && idx > 0) || props.showAsSecondary}/>
                  }
                </DescriptionDetails>
              </>))}
          </DescriptionList>
  }

  return <div 
        style={{
          gridTemplateColumns: props.showTitles === undefined || props.showTitles === true ? "minmax(min-content, 7rem) 1fr" : "1fr"
        }}
        className={`grid gap-2 text-sm ${props.className ?? ""}`}>
        {props.includeTitle && <>
            {(props.showTitles === undefined || props.showTitles === true) && <p className={`pl-1 py-1 mr-2 shrink-0 grow-0 ${props.showAsSecondary ? "text-xs" : ""}`}>Title</p>}
                      <EditableTextField
                          callback={(d)=>primitive.title = d}
                          editing={true}
                          editable
                          value = {primitive.title}
                          className='w-full'
                          compact={true}
                          border
                          placeholder={primitive.metadata?.placeholder ?? "Empty"}
                          fieldClassName="grow text-slate-700 p-1">
                      </EditableTextField>
        </>}
        {details.map((item, idx)=>(
          <>
           {(props.showTitles === undefined || props.showTitles === true) && <p className={`pl-1 py-1 mr-2 shrink-0 grow-0 ${props.showAsSecondary ? "text-xs" : ""}`}>{item.title}</p>}
            {potentialTarget && potentialTarget.includes(`referenceParameters.${item.key}`)
              ? <div className='w-full p-3.5 bg-gray-100 rounded animate-pulse'/>
              : <RenderItem editing={props.editable ?? true}  editable={props.editable ?? true} primitive={primitive} items={props.items} compact={props.compact || props.compactList} leftAlign={props.leftAlign} showTitles={props.showTitles} item={item} inline={props.inline} secondary={(props.inline && idx > 0) || props.showAsSecondary}/>
            }
          </>))}
  </div>

}
const fieldsBeingProcessed = function(primitive){

  const checkSection = ( section)=>{
    if( !section || !(section instanceof Object)){return []}
      const temp = Object.values(section).filter((d)=>{
        if( d && d.targetFields ){
          if( d.started ){
            if( (new Date() - new Date(d.started)) > (5 * 60 *1000) ){
              return false
            }
          }
          return true
        }
        return false
      })
      return temp.reduce((o,a)=>{o = o.concat(a.targetFields);return o}, [])
  }

  if( primitive  && primitive.processing){
    return [
      checkSection( primitive.processing.ai),
      checkSection( primitive.processing),
    ].flat()
  }
}

const ImportList = function({primitive, ...props}){
  const relationship = props.relationship ?? "imports"
  useDataEvent('relationship_update', primitive.id)
  
  let importList = primitive.primitives
  for(const d of relationship.split(".")){
    importList = importList[d]
  }

  return <div className='flex flex-col mt-1 overflow-y-scroll max-h-[inherit] rounded-lg bg-gray-50 border-gray-200'>
    {importList.map((d)=>{
      let items = primitive.itemsForProcessingFromImport(d, {pivot: false})
      let itemMetadata = items?.[0]?.metadata
      let filteredSource = d
      let filterForImport = primitive.referenceParameters.importConfig?.filter(d2=>d2.id === d.id) ?? []
      if( filterForImport.length === 0){
        if( Object.keys(d.primitives ).includes("imports") ){
          filterForImport = [{filters:[{type: d.metadata?.title ?? d.type}]}]
        }else{
          filterForImport = [{filters:[{type: d.metadata?.title ?? d.type}]}]
          filteredSource = d
        }

      }
      if( !filteredSource){
        return <></>
      }
      const filterExplanation = (filterForImport ?? []).map(d=>{
        return d.filters === undefined ? "" : d.filters.map(d=>{
          let source, value
          if( d.type === "parent"){
            source = "Assigned to "
            value = mainstore.primitive(d.value).title
          }else if( d.type === "parameter"){
            source = (itemMetadata?.parameters[ d.param ].title ?? d.param) + " is "
            value = "'" + d.value + "'"
          }else{
            source = d.type
            value = ""
          }
          return  <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            {items.length} from {source + value}
        </span>
        }).flatMap((d, i, a)=> i < (a.length - 1) ? [d, <span className='mx-0.5 text-xs text-gray-600'>and</span>] : d)
      }).flatMap((d, i, a)=> i < (a.length - 1) ? [d, <p className='mx-0.5 text-xs text-gray-600'>or</p>] : d)
      return <div className='px-2 hover:bg-gray-100 py-2 border-b border-b-gray-200 group'>
        <div className='flex w-full place-items-center'>
          <div className='grow flex space-x-1 place-items-center'><p className='text-gray-700 text-md'>{filteredSource.title}</p><p className='text-gray-500 text-sm'>- {filteredSource.metadata?.title ?? filteredSource.type} #{filteredSource.plainId}</p></div>
            <button
              key='delete'
                type="button"
                onClick={()=>mainstore.promptDelete({
                  prompt: `Remove segment from view?`,
                  handleDelete: ()=>{
                    //mainstore.removePrimitive( d )
                    primitive.removeRelationship(d, relationship)
                    return true
                  }
                })}
                className="shink-0 grow-0 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-ccgreen-500 invisible group-hover:visible"
            >
                <LinkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
        {filterExplanation}
       </div>
    })}
  </div>

}
const EvidenceList = function({primitive, ...props}){
  let evidence = props.evidenceList || primitive?.primitives.allUniqueEvidence
  useDataEvent('relationship_update', evidence.map((d)=>d.id))
  if( evidence === undefined || evidence === null || evidence.length === 0){return <></>} 


  let categoryIds = evidence.map((d)=>d.referenceId)
  if( primitive?.metadata?.evidenceCategories ){
    categoryIds = categoryIds.concat(primitive.metadata.evidenceCategories)
  }
  categoryIds = categoryIds.filter((v,i,a)=>v && a.indexOf(v)==i)
  let evidenceCategories = categoryIds.map((id)=>mainstore.category(id))

  let evidenceGroups = evidence.reduce((o, d)=>{
      let c = d._packed ? d.primitive : d
      if( c.metadata ){
        let evidenceType = c.metadata.id
        
        o[evidenceType] = o[evidenceType] || []
        o[evidenceType].push( d )
      }
      return o
    },{})

    if( evidenceCategories.length == 0 && Object.values(evidenceGroups).length === 0){
      return <></>
    }

  return (
         <div className={props.className || ""}>
         {!props.hideTitle && 
          <h3 className="mt-6 text-sm font-medium text-gray-500">{props.title || "Evidence"}</h3>
         }
         <div className='flex flex-col mt-1 overflow-y-scroll max-h-[inherit]'>
          {evidenceCategories.map((e)=>
            <div key={e.id} className='mx-1 my-0.5 p-1 bg-gray-50' >
              <p className='p-0.5 text-xs uppercase text-gray-500 w-full flex place-items-center mt-1 ml-0'><HeroIcon icon={e.icon} className='w-5 h-5 mr-1'/>{e.title}</p>
              {(evidenceGroups[e.id] === undefined || evidenceGroups[e.id].length === 0)
                && <p className='text-sm p-2 min-h-[3em] '>No items</p>
              }
              {(evidenceGroups[e.id] &&  evidenceGroups[e.id].length > 0) && 
                <div className={`p-2 w-full gap-3 ${props.frameClassName || ""} space-y-3 no-break-children`}>
                  {evidenceGroups[e.id].map((item)=>{
                    let origin
                    if( item._packed ){
                      origin = item.origin
                      item = item.primitive
                    }
                    return <PrimitiveCard onClick={props.onCardClick ? ()=>props.onCardClick(item) : undefined} key={item.id} showSidebar primitive={item} compact={true} border={true} origin={props.showOriginInfo && (origin || item.origin)} showOriginInfo={props.showOriginInfo} relationshipTo={props.relationshipTo || primitive} relationshipMode={props.relationshipMode} relationshipPath='outcomes' showCategories={props.showCategories} fields={props.cardFields}/>
                  })}
                </div>
              }
            </div>
          )}
         </div>
        </div>
  )
}


const Evidence = function({primitive, ...props}){
  let evidence = props.evidenceList || primitive?.primitives.allUniqueEvidence
  if( evidence === undefined || evidence === null || evidence.length === 0){return <></>} 

  if( props.aggregate ){
    evidence = Object.values(evidence.reduce((o, c)=>{
      if( c.metadata ){

        let evidenceType = c.metadata.id
        
        o[evidenceType] = o[evidenceType] || {e:c , count: 0}
        o[evidenceType].count++
      }

      return o
    },{}))
  }else{
    evidence = evidence.map((e)=>({e:e, count: 1}))
  }

  return (
         <div>
         {!props.hideTitle && 
          <h3 className="mt-6 text-sm font-medium text-gray-500">{props.title || "Evidence"}</h3>
         }
         <div>
          {evidence.map((e)=><EvidenceCard key={e.e.id} evidence={e.e} count={e.count} asPill={true}/>)}
         </div>
        </div>
  )
}

const Details = function({primitive, ...props}){
  const [editing, setEditing] = React.useState(props.editing)

  useEffect(()=>{
    setEditing(props.editing)
  }, [primitive.id, props.editing])
  
  const eventTracker = useDataEvent(props.noEvents ? undefined : ["set_parameter","set_field"], primitive.id )
  let metadata = primitive.metadata
  let parameters = primitive.metadata?.parameters || undefined
  let showParents = primitive.origin?.childParameters || primitive.task?.itemParameters?.[primitive.referenceId]
  if( !parameters && !primitive.parentParameters ){ return <></> }
  
  const panelTitle = <>{props.title || "Details"}{metadata.do_discovery && <AIProcessButton active="document_discovery" primitive={primitive} process={(p)=>p.analyzer().doDiscovery({force: true})}/>}</>

  
  return (
        <Panel title={panelTitle} editToggle={setEditing} editing={editing} hideTitle={props.hideTitle} {...props} >
          <dl className={`mt-2 mx-2 divide-y divide-gray-200 ${props.hideTitle ? "" : "border-t"} border-b border-gray-200 relative py-2`}>
            <Parameters primitive={primitive} editing={true} fullList={editing ?? props.fullList}/>
            {showParents && <Parameters primitive={primitive} editing={true} fullList={editing} showParents/>}
          </dl>
          {!props.hideFooter && 
            <h3 className={`flex text-slate-400 font-medium tracking-tight text-xs uppercase mt-2 place-items-center justify-end mt-2`}>
              {metadata.icon && <HeroIcon icon={metadata.icon} className='w-5 h-5 mr-1' strokeWidth={1}/>}
              {metadata.description}
            </h3>
            }
        </Panel>
  )
}

const Title = function({primitive, ...props}){
  const [showParentLinksManager, setShowParentLinksManager ] = useState(false)
  let color = primitive?.stateInfo?.colorBase || "gray"
  let relationshipConfig
  let relationship
  let metadataRender
  if(!primitive)return <></>
  
  if( props.relationshipTo ){
    relationship = primitive.parentRelationship(props.relationshipTo)
    relationshipConfig = (props.relationships && props.relationships[ relationship ]) || {title: relationship, color: 'gray'}
  }
  if( props.relationship ){
    relationshipConfig =  (props.relationships && props.relationships[ props.relationship ]) || {title: props.relationship, color: 'gray'}
  }

  let relationshipRender
  if( props.relationshipMode === "none"){
  }
  else if( props.relationshipMode === "presence"){
    const manageParentLinks = ()=>{
      setShowParentLinksManager(true)
      
    }
    if( relationship ){
      relationshipRender = <HeroIcon onClick={manageParentLinks} icon='StarIcon' className='ml-auto w-6 h-6 stroke-width-[0.5px] text-ccgreen-600 hover:text-ccgreen-900 fill-ccgreen-300 hover:fill-ccgreen-400'/>
    }else{
      if( props.relationshipTo && props.relationshipTo.primitives.allUniqueEvidence.filter((d)=>d.metadata?.isAggregation && d.primitives.descendantsInclude(primitive.id)).length > 0){
        relationshipRender = <HeroIcon onClick={manageParentLinks} icon='StarIcon' className='ml-auto w-6 h-6 stroke-width-[0.5px] text-ccpurple-600 hover:text-ccpurple-900 fill-ccpurple-300 hover:fill-ccpurple-400'/>
      }else{
        relationshipRender = <HeroIcon onClick={manageParentLinks} icon='StarIcon' className='ml-auto w-6 h-6 text-gray-300 hover:text-gray-600'/>
      }
    }
  }else{
    if( relationshipConfig ){
      relationshipRender = <span className={`inline-flex items-center rounded-full bg-${relationshipConfig.color}-100 px-2 py-0.5 text-xs font-medium text-${relationshipConfig.color}-800 ml-auto`}>
        {relationshipConfig.title}
        {relationshipConfig.icon && <HeroIcon icon={relationshipConfig.icon} className='w-4 h-4'/>}
      </span>
    }
  }
  if( props.showMetadataTitle && primitive.metadata){
    let metadata = primitive.metadata
    metadataRender = props.showMetadataTitle === "full"
      ? <p className='ml-1 truncate'>{metadata.title}</p>
      : <p className='ml-1 truncate opacity-0 group-hover:opacity-75 transition-opacity'>· {metadata.title}</p>
  }


  return (
    <>
    {showParentLinksManager && <PrimitivePicker.ParentLinksManager primitive={primitive} rootTitle={`Related ${props.relationshipTo.displayType}`} includeRoot={true} setOpen={()=>setShowParentLinksManager(false)} type="evidence" root={props.relationshipTo}/>}
      <h3 className={`flex text-slate-400 font-medium tracking-tight place-items-center text-${props.compact ? 'xs' : 'sm'} ${props.className}`}>
        {(props.showId === undefined || props.showId === true) && <p>{primitive.displayType} #{primitive.plainId}</p>}
        {(props.showId === "number") && <p>#{primitive.plainId}</p>}
        {props.showState && primitive.stateInfo.title && 
          <span className={`inline-flex items-center rounded-full bg-${color}-100 px-2 py-0.5 text-xs font-medium text-${color}-800 ml-3`}>
            {primitive.stateInfo.title}
        </span>
        }
        {relationshipRender}
        {metadataRender}
        {(props.compact && props.showLink) &&
          <button
              type="button"
              className="ml-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {props.showLink && <Link to={`/item/${primitive.id}`}><ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" /></Link>}
          </button>
        }
      </h3>
    </>
  )
}

const Hero = function({primitive, ...props}){
    const metadata = primitive.metadata
    const color = primitive.workspace?.color || "slate"
    const {gradient, values: colors} = useSmoothGradient(color)
    const navigate = useNavigate();

    return (<div 
        onClick={(e)=>{
          navigate(`/item/${primitive.id}`)
        }}
        tabIndex='0'
        id={primitive.plainId}
        className={
        [
          "pcard group relative flex flex-col space-between",
          props.bg ? props.bg : 'bg-white',
          'w-96 min-h-[12em]',
          'rounded-lg',
          `focus:ring-2 ring-offset-4 focus:outline-none hover:ring-2 hover:ring-ccgreen-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}`,
          "shadow border-[1px]",
          props.className].filter((d)=>d).join(' ')
        }>
          <div className={`relative h-32 rounded-t-lg flex-0 text-white`}>
            {/*<div className={`absolute pattern-isometric pattern-${color}-600 pattern-bg-${color}-500 pattern-opacity-20 pattern-size-8 h-full w-full rounded-t-lg`}></div>*/}
            <div className={`absolute h-full w-full rounded-t-lg`} style={{backgroundImage: gradient}}></div>
            <div className='absolute bottom-0 px-3 py-2 flex w-full'>
              {metadata && metadata.icon && <HeroIcon icon={metadata.icon} className='w-16 h-16' strokeWidth={0.8}/>}
              <div className='ml-2'>
                {metadata && <p className='text-2xl font-light'>{metadata.title}</p>}
                {metadata && <p className='text-lg font-light'>{metadata.description}</p>}
              </div>
            </div>
          </div>
          <CardMenu primitive={primitive} bg='transparent' className='absolute right-2 top-2'/>
          <p className='px-4 py-2 text-gray-800 text-lg my-2 flex-1'>{primitive.title}</p>
          <Users primitive={primitive} hideTitle={true} className='px-4'/>
          <Title primitive={primitive} showState={true} className='px-4 py-4 flex-0'/>
        </div>)
}
const Categories = function({primitive, ...props}){
  const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
  useDataEvent("set_field relationship_update", [props.relatedTo?.id, primitive.id], forceUpdate)

  const createCategory = async (referenceId)=>{
    const newPrim = await MainStore().createPrimitive({type: 'category', parent: primitive, categoryId: referenceId})
  }
    
  let button
  const baseCategories = [90]

  let createButtons = [
                          {title:"Create new", small:true, action: ()=>createCategory()},
                          {title:"As Axis", small:true, action: ()=>MainStore().doPrimitiveAction(primitive, "define_axis")}
                      ]
  for(const d of baseCategories){
    const category = mainstore.category(d)
    if( category){
      createButtons.push({title:`New ${category.title}`,small:true,  action: ()=>createCategory(d)})
      
    }
  }

  let list = props.directOnly ? primitive.primitives.origin.allUniqueCategory : primitive.primitives.allUniqueCategory
  if( !props.includeResult ){
    if( primitive.metadata?.resultCategories ){
      const excludeIds = primitive.primitives.results.uniqueAllIds
      list = list.filter((d)=>!excludeIds.includes(d.id))
    }
  }

  const content = <>
      <dd className="mt-1 text-sm text-gray-900">
        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200 space-y-2">
          {(list === undefined || list.length === 0) && 
            <div className='w-full p-2'>
              <button
              type="button"
              onClick={props.editable ? createCategory : undefined}
              className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <span className="mt-2 block text-sm font-semibold text-gray-900">{props.editable ? 'Create a new Category' : 'Nothing to show'}</span>
            </button>
            </div>
          }
          {list.map((category, idx) => <CategoryCard key={category.id} primitive={category} parentView={primitive} {...props} disableHover/>)}
        </ul>
      </dd>
  </>

  return props.hidePanel 
    ? 
      <div class={props.className ?? 'w-full h-full relative'}>
        {content}
        <div className='absolute right-6 bottom-2'>
          <DropdownButton flat noBorder icon={<PlusCircleIcon className='w-5 h-5'/>} items={createButtons} portal placement='right-end'/>
        </div>
      </div>
    : <Panel key='analysis' title={(<>Categories{button}</>)} collapsable={true} open={props.panelOpen !== undefined ? props.panelOpen : list && list.length > 0 } titleButton={createButtons} titleClassName='w-full font-medium text-sm text-gray-500 pt-5 pb-2 flex place-items-center'>
      {content}
    </Panel>
  
}

const Questions = function({primitive, ...props}){
  const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
  useDataEvent("set_field relationship_update", [props.relatedTo?.id, primitive.id], forceUpdate)
  let aiProcessSummary
  let analyzer
  let promptCategories

  if(false && props.relatedTo ){
    if(props.relatedTo.analyzer){
      analyzer = props.relatedTo.analyzer()
      if(analyzer.aiProcessSummary){
        aiProcessSummary = analyzer.aiProcessSummary() 
      }
    }
  }
  const resultTypes = primitive.metadata?.resultCategories?.map((d)=>d.resultCategoryId) || []
  console.log(resultTypes)
  promptCategories = resultTypes.map((id)=>{
    return mainstore.category(id).promptCategories
  }).flat().filter((v,i,a)=>v && a.indexOf(v)==i)

  const createQuestion = async ()=>{
    const newPrim = await MainStore().createPrimitive({type: 'question', parent: primitive})
  }
    
  let button
  
  if( props.relatedTo && props.relatedTo !== primitive ){
    button = <AIProcessButton active="document_questions" primitive={props.relatedTo} process={(p)=>p.analyzer().analyzeQuestions()}/>
  }

  const list = primitive.primitives.allQuestion

  return (
    <Panel key='analysis' title={(<>Questions{button}</>)} collapsable={true} open={props.panelOpen !== undefined ? props.panelOpen : list && list.length > 0} titleButton={{title:'Create new',small:true,action: createQuestion}} titleClassName='w-full font-medium text-sm text-gray-500 pt-5 pb-2 flex place-items-center'>
      <dd className="mt-1 text-sm text-gray-900">
        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {(list === undefined || list.length === 0) && 
            <div className='w-full p-2'>
              <button
              type="button"
              onClick={props.editable ? createQuestion : undefined}
              className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <span className="mt-2 block text-sm font-semibold text-gray-900">{props.editable ? 'Create a new Question' : 'Nothing to show'}</span>
            </button>
            </div>
          }
          {list.map((question, idx) => (
            <QuestionCard key={question.id} promptCategories={promptCategories} primitive={question} {...props} aiProcessSummary={aiProcessSummary}/>
          ))}
        </ul>
      </dd>
    </Panel>
  )
}

const Entity=({primitive, ...props})=>{
  let ring = !props.disableHover
  let margin = props.bigMargin ? (ring ? 'px-4 py-6' : 'px-2 py-3') : (ring ? 'px-2 py-3' : 'px-0.5 py-1')
  let mainTextSize = props.textSize || (props.compact ? 'sm' : 'md' )

  const handleEnter = (e)=>{
    if( e.key === "Enter"){
      e.preventDefault();
      e.stopPropagation()
      props.onEnter()
    }
  }

  const bgImg =  primitive?.referenceParameters?.hasBgImg ? true : primitive.linkedInData ? primitive.linkedInData.background_cover_image_url : undefined
  const logoImg = primitive?.referenceParameters?.hasImg ? true : primitive.linkedInData ? primitive.linkedInData.profile_pic_url : undefined

  if(props.micro){
    return <div 
          onClick={props.onClick ? (e)=>{props.onClick(e, primitive)} : undefined}
          onKeyDown={props.onEnter ? handleEnter : undefined}
          tabIndex='0'
          style={props.style}
          id={primitive.id}
          className={
          [
            "pcard group relative flex rounded-lg p-2",
            ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-ccgreen-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
            'place-items-center',
            props.className].filter((d)=>d).join(' ')
          }>

          { logoImg && (logoImg !== null) &&
            <VFImage className="w-8 h-8 mr-2 object-contain my-auto" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`} />
            }
            <p className='text-sm'>{primitive.title}</p>

          </div>
  }

  let content 
  let header
  let buttonSize = 5

  if( props.imageOnly || (props.fixedSize && props.scale < 0.4) ){
    
      content = logoImg ? <VFImage className={`${props.compact ? "p-0.5" : "p-4"} min-w-[2rem] min-h-[2rem] w-full h-full object-contain m-auto`} src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`} /> : <BuildingOffice2Icon className='text-gray-500 p-4'/>
       
      buttonSize = props.compact ? 5 : 16
  }else if(props.fullCard){
    const offerings = props.showOfferings && primitive.referenceParameters.offerings?.split(',').map(d=>d.trim().replace(/^and\s+/i, '')).map(d=>d.charAt(0).toUpperCase() + d.slice(1))
    const customers = props.showCustomers && primitive.referenceParameters.customers?.split(',').map(d=>d.trim().replace(/^and\s+/i, '')).map(d=>d.charAt(0).toUpperCase() + d.slice(1))

    let middle = [
      offerings &&  <div className='flex flex-col w-full border p-2 rounded-md min-h-[8rem]'>
        <p className='font-semibold text-xs'>Offerings</p>
        {offerings.map(d=><p>{d}</p>)}
      </div>,
      customers && <div className='flex flex-col w-full border p-2 rounded-md min-h-[8rem]'>
        <p className='font-semibold text-xs'>Target Customers</p>
        {customers.map(d=><p>{d}</p>)}
      </div>
    ]
    header = <>
          {props.hideCover !== true && bgImg && (bgImg !== null) &&
              <VFImage className="object-cover h-24 w-full rounded-t-lg" src={`/api/image/${primitive.id}-background`}/>
          }
          {props.hideCover !== true && (!bgImg || (bgImg === null)) &&
              <div className="min-h-[4rem] w-full rounded-t-lg bg-gray-300"/>
          }
          {!props.hideTitle && <div className={`px-4 py-1 ${props.hideCover !== true ? "bg-gray-800/50 absolute top-0 left-0 text-white " : "text-gray-800"} rounded-t-lg w-full`}>
              <p className='text-sm'>{primitive.displayType} #{primitive.plainId}</p>
            </div>}
           </>
      content = <>
        <div className='w-full px-4 pt-2 flex place-items-center'>
          { logoImg && (logoImg !== null) &&
            <VFImage className="w-8 h-8 object-contain my-auto" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`} />
            }
            <p className={`${props.fixedSize ? "line-clamp-2" : "py-2"} px-2 text-lg text-gray-700 font-semibold`}>{primitive.title}</p>
          </div>
          {props.hideDescription !== true && 
            <div className='grow'>
              <p className={`${props.fixedSize ? "line-clamp-4" : "py-2"} text-gray-500 px-4 text-sm `}>
                {primitive.referenceParameters.description}
            </p>
          </div>
          }
          {middle && <div className='flex gap-2 font-light m-4 text-gray-600 text-sm'>{middle}</div>}
          {primitive.referenceParameters?.url && 
            <a 
              target='_blank'
              href={primitive.referenceParameters.url}
              className='text-gray-300 hover:text-gray-600 px-4 py-2 mt-1 text-xs font-semibold flex'>
              <LinkIcon className='h-4 pr-0.5'/><p className='truncate'>{props.urlShort ? "Link" : primitive.referenceParameters.url}</p>
            </a>}
        </>

  }else{
    header = <>
          {props.hideCover !== true && bgImg && (bgImg !== null) &&
              <VFImage className="object-cover h-24 w-full rounded-t-lg" src={`/api/image/${primitive.id}-background`}/>
          }
          {props.hideCover !== true && (!bgImg || (bgImg === null)) &&
              <div className="min-h-[4rem] w-full rounded-t-lg bg-gray-300"/>
          }
          {!props.hideTitle && <div className={`px-4 py-1 ${props.hideCover !== true ? "bg-gray-800/50 absolute top-0 left-0 text-white " : "text-gray-800"} rounded-t-lg w-full`}>
              <p className='text-sm'>{primitive.displayType} #{primitive.plainId}</p>
            </div>}
           </>

      content = <>
        <div className='w-full px-4 pt-2 flex place-items-center'>
          { logoImg && (logoImg !== null) &&
            <VFImage className="w-8 h-8 object-contain my-auto" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`} />
            }
            <p className={`${props.fixedSize ? "line-clamp-2" : "py-2"} px-2 text-lg text-gray-700 font-semibold`}>{primitive.title}</p>
          </div>
          {props.hideDescription !== true && 
            <div className='grow'>
              <p className={`${props.fixedSize ? "line-clamp-4" : "py-2"} text-gray-500 px-4 text-sm `}>
                {primitive.referenceParameters.description}
            </p>
          </div>
          }
          {(props.showCategories && props.hideCategories !== true) && <div className='w-full px-4 flex flex-wrap'>
            {primitive.categories.map((category)=>(
              <CategoryCardPill key={category.id} primitive={category}/>
            ))}
          </div>}
          {primitive.referenceParameters?.url && 
            <a 
              target='_blank'
              href={primitive.referenceParameters.url}
              className='text-gray-300 hover:text-gray-600 px-4 py-2 mt-1 text-xs font-semibold flex'>
              <LinkIcon className='h-4 pr-0.5'/><p className='truncate'>{props.urlShort ? "Link" : primitive.referenceParameters.url}</p>
            </a>}
        </>
  }

  let style = {}
  if( props.fixedWidth){
    style.minWidth = props.fixedWidth
    style.maxWidth = props.fixedWidth
  }
  if( props.fixedSize || props.imageOnly){
    style.minWidth = props.fixedSize || "4rem"
    style.maxWidth = props.fixedSize || "4rem"
    style.minHeight = props.fixedSize || "4rem"
    style.maxHeight = props.fixedSize || "4rem"
  }
  
  const showAsProcessing = primitive.processing?.pivot

  return (
    <div 
        onClick={props.onClick ? (e)=>{props.onClick(e, primitive)} : undefined}
        onKeyDown={props.onEnter ? handleEnter : undefined}
        tabIndex='0'
        id={props.fullId ? primitive.id : primitive.plainId}
        style={style}
        className={
        [
          "pcard group relative flex flex-col ",
          props.hideCover !== true ? "min-h-[12rem]" : "", 
          props.bg ? props.bg : 'bg-white',
          props.flatBorder ? '' : 'rounded-lg',
          ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-ccgreen-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
          props.border ? "shadow border-[1px]" : '',
          props.inline ? "flex space-x-2" : "",
          props.dragShadow ? "shadow-xl rotate-[-5deg]" : "",
          props.className].filter((d)=>d).join(' ')
        }>
          {header}
          {!props.hideMenu && <CardMenu 
            primitive={primitive} 
            callbackProcessor={props.callbackProcessor}
            bg='bg-white/50 group-hover:bg-white' 
            className='absolute right-1 top-1' 
            size={buttonSize}
            showVisitPage={false} 
            custom={[
              {
                title: 'Expand',
                action: ()=>props.onEnter ? props.onEnter(primitive) : undefined,
                icon: ExpandArrow,
              },
            ]}
            />}
            {content}
          {showAsProcessing && ProcessingPane()}
    </div>
  )
}

const Variant=({primitive, ...props})=>{
  if( primitive === undefined){return}
  const type = props.listType || primitive.type
  if( type === 'prompt' ){
    return <Prompt primitive={primitive} {...props}/>
  }
  if( type === 'entity' ){
    return <Entity primitive={primitive} {...props}/>
  }
  if( type === 'category' ){
    return <CategoryCard primitive={primitive} {...props}/>
  }
  if( type === 'summary' ){
    return <SummaryCard primitive={primitive} {...props}/>
  }
  if( type === 'segment' ){
    return <SegmentCard primitive={primitive} {...props}/>
  }
  if( type === 'category_pill' ){
    return <CategoryCard.Pill primitive={primitive} {...props}/>
  }
  return undefined
}
export const Prompt = ({primitive, ...props})=>{
  const [editing, setEditing] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const [deleteMessage, setDeleteMessage] = React.useState( "Are you sure you want to delete this prompt?" )
  const updateTitle = (newTitle )=>{
    primitive.title = newTitle
    return true
  }
  const textSize = props.editable ? "sm" : "xs"
  const itemCount = props.itemCount || 0
  const processed = props.processed || false
  const unprocessed = props.unprocessed || false
  const prompt = primitive
  const showAsEmpty = prompt.title === undefined || prompt.title === null || prompt.title.trim() === "" 
  const showEmptyAsPlaceholder = (props.editable === true) && !prompt.allowInput
  const processedNumbers = (processed + unprocessed ) > 1
  
  const handleRemove = async ()=>{
    await MainStore().removePrimitive( primitive )
    setConfirmRemove(false)
  }
  
  const promptConfirmRemove = ()=>{
    const evidence = primitive.primitives.allUniqueEvidence
    if( evidence.length > 0){
      setDeleteMessage(`Deletion of this prompt will also delete ${evidence.length} child items`)
    }

    setConfirmRemove(true)
  }

  return (
    <>
              <div key={prompt.id} className='w-full flex place-items-center mt-2 justify-between group'>
              <div key='summary' className={`flex text-${textSize} flex-0`}>
                  <p className={`p-1 pl-2 bg-gray-200 ${showAsEmpty && (!props.editable || !showEmptyAsPlaceholder) ? "rounded-md" : "rounded-l-md"} border border-gray-300`}> 
                      {showAsEmpty ? prompt.metadata.summaryEmpty : prompt.metadata.summary}
                  </p> 
                  {(showEmptyAsPlaceholder || !showAsEmpty) &&
                      <div className={`p-1 bg-white rounded-r-md border border-gray-300 ${props.editable ? 'pr-2' : ''}`}> 
                          {props.editable
                            ?  <EditableTextField 
                                callback={updateTitle}
                                editable={props.showEdit ? ()=> setEditing( true ) : undefined}
                                stopEditing={()=>setEditing(false)}
                                submitOnEnter={true}
                                editing={editing}
                                value = {primitive.title}
                                default='<Add term>'
                                className='w-full'
                                compact={true}
                                fieldClassName={`${(primitive.title || "").search(/\s/) == -1 ? "break-all" : "break-word"} grow text-${textSize} text-slate-700`}>
                              </EditableTextField>
                            : prompt.title
                            }
                      </div>
                  }
              </div>
              { props.editable
              ?  <div className='flex space-x-2 invisible group-hover:visible'>
                  <button
                    key='edit'
                      type="button"
                      onClick={()=>setEditing( !editing )}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {editing ? <CheckIcon className="h-5 w-5" aria-hidden="true" /> : <PencilIcon className="h-5 w-5" aria-hidden="true" />}
                  </button>
                  <button
                    key='delete'
                      type="button"
                      onClick={promptConfirmRemove}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  > <TrashIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              : <div className='flex w-fit grow-0 place-items-center'>
                  {processedNumbers 
                    ? <div className='flex w-12 grow-0 place-items-center border bg-amber-100'>
                        <div key='status_p' style={{width: `${processed / (processed + unprocessed)*100}%`}} className={`flex place-items-center justify-center h-4 bg-green-400`}></div>
                      </div>
                    : <div key='status' className={`ml-auto w-3 h-3 rounded-full border ${processed ? "bg-green-200" : 'bg-amber-200'}`}/>
                  }
                  {(itemCount > 0) && <p key='count' className="flex hover:bg-indigo-600 hover:text-white justify-end ml-0.5 px-1 py-0.5 rounded-md shrink-0 text-indigo-700 text-xs">{itemCount} items</p>}
                  </div>
              }
            </div>
      {confirmRemove && <ConfirmationPopup title="Confirm deletion" confirm={handleRemove} message={deleteMessage} cancel={()=>setConfirmRemove(false)}/>}
     </>)
}

function Aggregation({primitive, ...props}){
  useDataEvent("relationship_update", primitive.id)
  const [show, setShow] = useState(false)
  if( !primitive.metadata?.isAggregation ){return <></>}
  const subList = primitive.primitives.allUniqueEvidence
  if( subList.length === 0 ){return <></>}
  return (<>
    <p 
      onClick={()=>setShow(!show)}
      className={[
      "text-xs text-gray-500 mt-1 flex place-items-center hover:text-gray-800 cursor-pointer",
    ].join(" ")
    }>{subList.length} Items<ChevronRightIcon className={`w-2.5 h-2.5 ml-0.5 mt-0.5 ${show ? "rotate-90" : ""}`}/></p>
    {show && <div 
      className={[
        'border-l-2 space-y-2 pt-2 mt-1 ml-1 pl-2',
        ].join(" ")}>
      {subList.map((d)=>(
        <PrimitiveCard primitive={d} textSize='sm' titleAtBase showMeta compact disableHover showMenu menuProps={{showVisitPage:false, showUnlink: true}} relatedTo={primitive} />
      ))}
      </div>}
  </>)
}


export function SmallMeta(props){
  const metadata = props.metadata || props.primitive?.metadata

  return (
    <h3 className={[
        `flex text-slate-400 font-medium tracking-tight text-xs uppercase place-items-center`,
        props.inline ? "" : (props.showMeta === "small-top" ? "mb-2 border-b" : "mt-2")
        ].join(" ")}>
              {metadata?.icon && <HeroIcon icon={metadata.icon} className='w-5 h-5 mr-1' strokeWidth={1}/>}
              {metadata?.title ?? `Generic ${props.primitive?.type}`}
            </h3>
  )
}

export function PrimitiveCard({primitive, className, showDetails, showUsers, showRelationships, showResources, major, disableHover, fields,...props}) {
  let ring = !disableHover
  let mainTextSize = props.textSize  || (props.compact ? 'sm' : 'md' )
  let margin = props.bigMargin ? (ring ? 'px-4 py-6' : 'px-2 py-3') : (ring ? 'px-2 py-3' : 'px-0.5 py-1')

  const [eventTracker, updateForEvent] = React.useReducer( (x)=>x+1, 0)
  const [editing, setEditing] = React.useState(false)
  const callbackId = React.useRef(null)
  React.useEffect(()=>{
    if( !props.noEvents ){
      const ids = [primitive.id, props.relationshipId].filter((d)=>d)
      callbackId.current = mainstore.registerCallback(callbackId.current, "set_title set_parameter set_field relationship_update", updateForEvent, ids )
      return ()=>{
        mainstore.deregisterCallback(callbackId.current )
      }
    }
  }, [])

  if( !major  && props.variant !== false){
    const variant = Variant({primitive, ...props, className, showDetails, showUsers, showRelationships, showResources, major, disableHover, fields})
    if( variant ){
      return variant
    }
  }



  let metaSummary
  let smallMeta
  let metadata
  if( props.showMeta){
    metadata = primitive.metadata
    if( metadata ){
      if( props.showMeta === "summary" ){
        metaSummary = <p className={`text-${mainTextSize} pl-1 font-medium`}>{metadata.summary}</p>
      }
      else if( props.showMeta !== "large" ){
        smallMeta = <SmallMeta {...props} metadata={metadata}/>
      }
    } 
  }
  let titleAtBase = fields || props.titleAtBase

  if( major ){
    margin = ""
    mainTextSize = "lg"
    ring = false
  }
  let withHero = props.enableHero && primitive.metadata?.title === "Venture"
  if( withHero ){
    mainTextSize = '2xl'
  }

  const updateTitle = (newTitle )=>{
    primitive.title = newTitle
    return true
  }
  
  if( fields ){
    fields = fields.map((d)=>d instanceof Object ? d.field : d)
  }

  let content = (fields && !fields.includes('title')) ? undefined : 
      <>
        {props.editable === false 
          ? 
            <p
              className={`${(primitive.title || "").search(/\s/) == -1 ? "break-all" : "break-word"} grow text-${mainTextSize} ${withHero ? "px-2 self-end text-slate-50 font-bold w-full" : "text-slate-700"}`}
            >
              {primitive.title}
            </p>
          : <EditableTextField 
            callback={updateTitle}
            editable={props.showEdit ? ()=> setEditing( true ) : undefined}
            doubleClickToEdit={props.doubleClickToEdit}
            stopEditing={()=>setEditing(false)}
            editing={editing}
            value = {primitive.title}
            className='w-full'
            compact={true}
            placeholder={primitive.metadata?.placeholder ?? "Empty"}
            fieldClassName={`${(primitive.title || "").search(/\s/) == -1 ? "break-all" : "break-word"} grow text-${mainTextSize} ${withHero ? "px-2 self-end text-slate-50 font-bold" : "text-slate-700"}`}>
          </EditableTextField>
        }
        {props.showMenu &&
          <CardMenu primitive={primitive} callbackProcessor={props.callbackProcessor} relatedTo={props.relatedTo} {...props.menuProps} size='6' bg='transparent' className='invisible group-hover:visible'/>
        }
        {(!props.compact && props.showEdit) &&
          <button
              type="button"
              onClick={ props.showEdit ? ()=>setEditing(!editing) : undefined}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              {props.showEdit && !editing && <PencilIcon className="h-5 w-5" aria-hidden="true" />}
              {props.showEdit && editing && <CheckIcon className="h-5 w-5" aria-hidden="true" />}
          </button>
        }
        {(!props.compact && props.showLink) &&
          <button
              type="button"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              {props.showLink &&  <Link to={`/item/${primitive.id}`}><ArrowTopRightOnSquareIcon className="h-5 w-5" aria-hidden="true" /></Link>}
          </button>
        }
        {(props.showSidebar) &&
          <button
              type="button"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" aria-hidden="true" onClick={()=>mainstore.sidebarSelect(primitive)}/>
          </button>
        }
      </>

  let header
  if(metadata && !smallMeta){
      header = <div className='flex'>
        <HeroIcon icon={metadata.icon} className={`${props.textSize === "sm" ? 'w-6 h-6' : 'w-10 h-10'} mr-2 shrink-0 grow-0 text-gray-400 ease-linear transition-colors  group-hover:text-gray-800`} strokeWidth={1}/>
        <div className='w-full'>
          <div className={`flex items-start justify-between ${props.compact ? "space-x-1" : "space-x-3"}`}>
            {metaSummary}
            {content}
          </div>
          {!titleAtBase && !props.hideTitle && <Title primitive={primitive} {...props} showMetadataTitle={props.showMetadataTitle === undefined ? true : props.showMetadataTitle} className='mt-1'/>} 
        </div>
      </div>

  }else{
    header = <>
              {!titleAtBase && !metadata && !props.hideTitle && <Title primitive={primitive} {...props}/>} 
              {smallMeta && props.showMeta === "small-top" && smallMeta}
              {content && 
                <div 
                  className={
                    withHero
                      ? "rounded-t-lg bg-gradient-to-br from-slate-900 to-slate-600 -mx-2 -mt-3 h-24 flex" 
                      : `flex items-start justify-between ${props.compact ? "space-x-1" : "space-x-3"} ${props.compact ? titleAtBase ? '' : 'mt-2' : 'mt-3'}`
                  }>
                {metaSummary}
                {content}
              </div>}
            </>
  }

  const handleEnter = (e)=>{
    if( e.key === "Enter"){
      e.preventDefault();
      e.stopPropagation()
      props.onEnter(primitive)
    }
  }

  const packedFields = fields ? fields.filter((d)=>d?.indexOf(",") >= 0).map((d)=>d.split(",")).flat() : undefined
  fields = fields ? fields.filter((d)=> (d !== "title") && (d?.indexOf(",") === -1)) : undefined

  let style = props.style || {}
  if( props.fixedWidth){
    style.minWidth = props.fixedWidth
    style.maxWidth = props.fixedWidth
  }
  if( props.fixedSize){
    style.minWidth = props.fixedSize
    style.maxWidth = props.fixedSize
    style.minHeight = props.fixedSize
    style.maxHeight = props.fixedSize
  }
  const showAsProcessing = primitive.processing?.pivot

  return (
    <div 
        onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
        onKeyDown={props.onEnter ? handleEnter : undefined}
        tabIndex='0'
        id={props.fullId ? primitive.id : primitive.plainId}
        style={style}
        className={
        [
          "pcard group relative",
          props.bg ? props.bg : 'bg-white',
          margin,
          props.flatBorder ? '' : 'rounded-lg',
          ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-ccgreen-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
          props.border ? "shadow border-[1px]" : '',
          props.inline ? "flex space-x-2" : "",
          props.dragShadow ? "shadow-xl rotate-[-5deg]" : "",
          className].filter((d)=>d).join(' ')
        }>
        {props.showExpand && 

          <div 
            onClick={props.onEnter}
            className='absolute flex place-items-center justify-center right-0 top-0 mr-0.5 mt-0.5 w-5 h-5 text-slate-300 invisible group-hover:visible hover:text-blue-500 rounded-lg hover:bg-gray-100 active:bg-blue-500 active:text-gray-100'>
            <ExpandArrow 
              className='w-4 h-4'
            />
          </div>}
          {
            (primitive.type === "result" && primitive.referenceParameters?.hasImg)   && 
              <>
                <div className="bg-gray-200 h-[8.25rem] mb-2 w-full rounded-t-lg"/>
                <VFImage className="absolute top-0 left-0 object-cover h-36 w-full rounded-t-lg" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`}/>
              </>
          }
          {props.showImg 
            ?  
              <div className='w-full flex mb-2 text-lg'>
                <VFImage rounded shadow className="object-cover h-12 w-12 mr-2" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`}/>
                {header}
              </div>
            : header
          }
      {fields && (packedFields === undefined || fields.length > 0) &&
        <div className={[
          props.inline ? `flex items-start justify-between space-x-1 w-max` : ``,
          props.fieldsInline ? `flex -ml-1 space-x-1 py-2` : ``, 
          ].join(" ")}>
            <Parameters primitive={primitive} editable={false} noEvents={props.noEvents} inline={props.inline || props.fieldsInline} compact={true} showAsSecondary={props.showAsSecondary} asMain={true} fields={fields} showTitles={props.fieldsInline === true} className='!py-1'/>
        </div>
      }
      {packedFields &&  (packedFields.length > 0) &&
        <div className='flex space-x-1 py-2'>
            <Parameters primitive={primitive} editable={false} noEvents={props.noEvents} inline={true} compact={true} showAsSecondary={props.showAsSecondary} asMain={true} fields={packedFields} showTitles={false} className='!py-1'/>
            {packedFields.includes('title') && <p className='text-sm my-1' >{primitive.title}</p>}
        </div>
      }

        {props.showOriginInfo && 
          <div className='flex items-start space-x-1'>
            <PrimitiveCard.Parameters editable={false}  primitive={props.origin || primitive.origin} inline={true} showAsSecondary={true} noEvents={props.noEvents}  compact={true} showTitles={false} fields={props.showOriginInfo} />
          </div>}
        {showRelationships && <PrimitiveCard.Relationships primitive={primitive}/>}
          {props.showQuote === true && (primitive.quote || primitive.referenceParameters?.quote) && 
              <div className='w-full px-6 py-2 '>
                  <p className='pl-2 border-l-4 text-gray-500 italic text-sm line-clamp-6'><strong>Original text:</strong> {primitive.quote || primitive.referenceParameters?.quote}</p>
              </div>
          }
        {false && props.editState && <div className='w-full flex'><DropdownButton colorKey='colorBase' items={PrimitiveConfig.stateInfo[primitive.type]} setSelectedItem={(d)=>primitive.setField('state', Object.keys(PrimitiveConfig.stateInfo[primitive.type])[d] )} selected={primitive.state} portal small className='ml-auto'/></div>}
        {showDetails === true && <PrimitiveCard.Details primitive={primitive} editing={props.editing}/>}
        {showUsers === true && <PrimitiveCard.Users primitive={primitive}/>}
        {(showDetails === "panel" || showUsers === "panel") && <Panel title="More" collapsable={true} open={props.panelOpen}>
            {showDetails === "panel" && <PrimitiveCard.Details primitive={primitive}/>}
            {showUsers === "panel" && <PrimitiveCard.Users primitive={primitive}/>}
          </Panel>}
        {showResources && <PrimitiveCard.Resources primitive={primitive}/>}
        {(props.showEvidence  === true) && <PrimitiveCard.Evidence primitive={primitive}/>}
        {(props.showEvidence  === "compact") && <PrimitiveCard.Evidence primitive={primitive} hideTitle={true} compact={true} aggregate={true}/>}
        {props.children}
        {props.editable !== false && titleAtBase && !props.hideTitle && <Title primitive={primitive} {...props} className={props.inline ? 'grow-0' : 'grow-0 mt-1'}/>}
        {smallMeta && props.showMeta !== "small-top" && smallMeta}
        {primitive._doingDiscovery && !primitive.discoveryDone && <div className='w-2 h-2 absolute bg-amber-500 rounded-lg right-1 top-1'/>}
        {primitive.openai_error && <div className='w-2 h-2 absolute bg-red-500 rounded-lg right-1 top-1'/>}
        {primitive.metadata?.isAggregation && <Aggregation primitive={primitive} {...props}/>}
        {props.showCategories && <div className='w-full flex flex-wrap'>
          {primitive.categories.map((category)=>(
            <CategoryCardPill primitive={category}/>
          ))}
        </div>}
        {showAsProcessing && ProcessingPane()}
    </div>
  )
}


function ProcessingBase({primitive, ...props}){
  useDataEvent("set_field", primitive?.id)
  
  let showAsProcessing = primitive?.processing && (primitive.processing.pivot || primitive.processing.enrich)

  if( !showAsProcessing ){
    if( primitive?.processing?.expanding){
      if( Object.values(primitive.processing.expanding).filter((d)=>d).length > 0){
        showAsProcessing = true
      }
    }
    if( primitive?.processing?.ai){
      if( Object.values(primitive.processing.ai).filter((d)=>d).length > 0){
        showAsProcessing = true
      }
    }
  }

  if( !showAsProcessing){
    return <></>
  }
  return (<div
      className="w-full h-2 absolute bottom-0 left-0 before:bg-gradient-to-r before:from-transparent before:via-ccgreen-600/100 before:to-transparent before:absolute before:bottom-0 before:left-0 before:w-full before:h-[6px] before:-translate-x-[90%] before:animate-[shimmer_4s_infinite]"
    >
  </div>)
}

function ProcessingPane(){
 return (<div className='absolute top-0 left-0 w-full h-full backdrop-blur-sm bg-white/40 place-items-center flex'>
            <Grid
              height="40%"
              color="#4fa94d"
              ariaLabel="grid-loading"
              radius="12.5"
              wrapperStyle={{}}
              wrapperClass="mx-auto"
              visible={true}
              />
          </div>)
}


function CardForList({primitive, fields, ...props}){
  const metadata = primitive.metadata

  let minor = metadata.renderConfig?.cards?.minor
  if( metadata.renderConfig?.cards?.fields ){
    fields = metadata.renderConfig?.cards?.fields
  }

  const showTitle = fields?.includes("title")
  const showIcon = fields?.includes("icon")
  
  
  let headerImg, logoImg
  if( primitive.type === "entity" ){
    headerImg =  primitive?.referenceParameters?.hasBgImg ? `/api/image/${primitive.id}-background` : undefined
    logoImg = primitive?.referenceParameters?.hasImg ? true : primitive.linkedInData ? primitive.linkedInData.profile_pic_url : undefined
  }
  else{
    headerImg = primitive?.referenceParameters?.hasImg ? `/api/image/${primitive.id}` : undefined
  }

  return <div 
    onClick={props.onClick ? ()=>props.onClick(undefined, primitive) : undefined}
    className='pcard group relative bg-white px-2 py-3 rounded-lg focus:ring-2 focus:outline-none hover:ring-1 hover:ring-ccgreen-300 hover:subtle-shadow-bottom shadow border-[1px] text-slate-600'>
      {headerImg && (headerImg !== null) &&
        <>
            <div className="bg-gray-200 h-[8.25rem] mb-2 w-full rounded-t-lg"/>
            <VFImage className="absolute top-0 left-0 object-cover h-36 w-full rounded-t-lg" src={headerImg}/>
        </>
      }
      <div className="border-b flex justify-between mb-2 pb-2 place-items-center w-full">
        {showIcon && <VFImage className="w-8 h-8 mr-2 object-contain my-auto shrink-0" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`} />}
        <EditableTextField 
            callback={(v)=>primitive.title = v}
            value = {primitive.title}
            fieldClassName='grow'
            className='w-full'
            />
          {metadata && metadata.icon && <HeroIcon icon={metadata.icon} className='w-12 h-12 shrink-0' strokeWidth={0.8}/>}
        </div>
        <div className='flex flex-col px-1 space-y-1.5 text-sm mb-2'>
          {(fields ?? []).filter(d=>primitive.referenceParameters[d] && metadata?.parameters[d]).map(field=>(
            <div className='felx flex-col'>
              <p className='text-slate-400 text-xs font-semibold uppercase'>{metadata.parameters[field].title}</p>
              <PrimitiveCard.RenderItem primitive={primitive} item={{...metadata.parameters[field], value:primitive.referenceParameters[field], key: field}} compact leftAlign showTitles border={false}/>
            </div>
          ))}
        </div>
        {minor && <div className='flex flex-col px-1 space-y-1.5 text-xs mt-1 mb-2 text-slate-400'>
          {minor.filter(d=>primitive.referenceParameters[d] && metadata?.parameters[d]).map(field=>(
              <PrimitiveCard.RenderItem primitive={primitive} minor editable={false} item={{...metadata.parameters[field], value:primitive.referenceParameters[field], key: field}} compact leftAlign showTitles border={false}/>
          ))}
        </div>}
        <PrimitiveCard.Evidence primitive={primitive} hideTitle={true} compact={true} aggregate={true}/>
        <div className='w-full justify-between flex '>
          <p className='mt-2 text-slate-400 text-xs'>{primitive.displayType} #{primitive.plainId}</p>
          <CardMenu primitive={primitive} bg="transparent" size={6}/>
        </div>
    </div>
}
function Outputs({primitive}){
    const values = primitive.outputs
    const outputPins = primitive.outputPinsWithStatus

    let pins = Object.keys(primitive.outputPins).reduce((a,c)=>{a.push({...outputPins[c], id: c}); return a},[])
    
    if(outputPins){
      let removeImport = true
      if( outputPins.impout?.connected){

        const primOuts = primitive.itemsForProcessing
        if( primOuts.length > 0){
          values.impout = {
            config: "primitive",
            data: primOuts
          }
          removeImport = false
        }
      }
      if( removeImport){
        pins = pins.filter(d=>d.id !== "impout")
      }
    }
    
    return RenderPins({primitive, values, pins})
}
function Inputs({primitive}){
    const pins = primitive.outputPins
    return RenderPins({primitive, pins})
}
function InputPins({primitive, dataForNewInstance, newInstanceCallback, updateMissing, pins}){
  if( !(primitive.type === "flowinstance" || (primitive.type === "flow" && newInstanceCallback))){
    return <></>
  }
  pins = pins ?? primitive.getConfig?.inputPins
  return EditablePins( {primitive, pins, dataForNewInstance, newInstanceCallback, updateMissing})
}
function ControlPins({primitive}){
  if( primitive.type !== "flow"){
    return <></>
  }
  const pins = primitive.getConfig?.controlPins ?? {}
  return EditablePins( {primitive, pins})
}
function EditablePins({primitive, pins, dataForNewInstance, newInstanceCallback, updateMissing}){
    const pinsToRender = Object.keys(pins).filter(d=>d.split || pins[d].types?.includes("string") || pins[d].types?.includes("string_list"))
    const [missing, setMissing ]= useState(()=>{
      const v = pinsToRender.reduce((a,c)=>{
        if( pins[c].split){
          return a
        }
        a[c] = true
        return a
      },{})
      if( updateMissing ){
        updateMissing( v )
      }
      return v
    })
    return <DescriptionList inContainer={true}>
      {pinsToRender.map(pinName=>{
        const d = pins[pinName]
        if( d.split){
          return <p className='@lg:col-span-2 py-2 w-full text-slate-400 text-xs font-semibold uppercase'>{d.title ?? ""}</p>
        }
        let control = RenderItem({
            primitive,
            callback: (v)=>{
              const newMissing = {
                  ...missing,
                  [pinName]: !v || v.trim() === ""
              }
              setMissing(newMissing)
              if( updateMissing ){
                updateMissing( newMissing )
              }
              if( newInstanceCallback ){
                return newInstanceCallback(pinName, v)
              }else{
                return primitive.setParameter(pinName, v)
              }
            },
            item:{
              type: d.format ?? "long_string",
              value: dataForNewInstance ? dataForNewInstance[pinName] : primitive.referenceParameters?.[pinName],
              key: pinName
            }
          })
          
        return <>
                <DescriptionTerm inContainer={true}>{d.name}</DescriptionTerm>
                <DescriptionDetails inContainer={true}>{control}</DescriptionDetails>
              </>
      })}
    </DescriptionList>
}
function RenderPinValues({values, pin}){
    const pinValue = values[pin.id]
    if( pinValue ){
        const renderAs = pinValue.config
        if( renderAs === "string_list"){
            return <p>{pinValue.data.join(", ")}</p>
        }else if(renderAs === "string"){
            return <p>{pinValue.data}</p>
        }else if(renderAs === "object_list"){
          return <ul>{pinValue.data.map(d=>Object.keys(d).map(k=><li>{k}:{d[k]}</li>))}</ul>
        }else if(renderAs === "primitive"){
            return <div className='flex flex-col space-y-2'>
                {pinValue.data.map(d=><PrimitiveCard primitive={d}/>)}
              </div>
        }
    }
    return <></>
}
function RenderPins({primitive, values, pins}){
  return <DescriptionList inContainer={true}>
    {pins.map(d=><>
        <DescriptionTerm inContainer={true}>{d.name}</DescriptionTerm>
        <DescriptionDetails inContainer={true}>{RenderPinValues({values, pin: d})}</DescriptionDetails>
    </>)}

  </DescriptionList>
};

PrimitiveCard.ProcessingBase = ProcessingBase
PrimitiveCard.Variant = Variant
PrimitiveCard.Details = Details
PrimitiveCard.Questions = Questions
PrimitiveCard.Categories = Categories
PrimitiveCard.Parameters = Parameters
PrimitiveCard.Users = Users
PrimitiveCard.Relationships = Relationships
PrimitiveCard.EvidenceHypothesisRelationship = EvidenceHypothesisRelationship
PrimitiveCard.Resources = Resources
PrimitiveCard.Banner = Banner
PrimitiveCard.Title = Title
PrimitiveCard.Hero = Hero
PrimitiveCard.Evidence = Evidence
PrimitiveCard.Entity = Entity
PrimitiveCard.EvidenceList = EvidenceList
PrimitiveCard.RenderItem = RenderItem
PrimitiveCard.CardMenu = CardMenu
PrimitiveCard.SmallMeta = SmallMeta
PrimitiveCard.ImportList = ImportList
PrimitiveCard.ListCard = CardForList
PrimitiveCard.OutputPins = Outputs
PrimitiveCard.InputPins = InputPins
PrimitiveCard.ControlPins = ControlPins


