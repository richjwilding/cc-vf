import * as Headless from '@headlessui/react'
import { Listbox, ListboxOption, ListboxLabel } from "./@components/listbox"
import { Label } from "./@components/fieldset"
import { Badge } from "./@components/badge"
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from './@components/dropdown'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { Button } from './@components/button'
import clsx from 'clsx'
import CollectionUtils from './CollectionHelper'
import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { HeroIcon } from './HeroIcon'
import { Disclosure, Transition } from '@headlessui/react'


function AxisPicker({className, options, name, title, type, small, disabled, autoFocus,'aria-label': ariaLabel,...props}){
    const [editing, setEditing] = useState(false)

    function getOptions(){
            const items = props.source?.itemsForProcessing ?? []
            console.log(`Got ${items.length}`)
            if( !props.source){
                return <></>
            }
            
            const labelled = CollectionUtils.axisFromCollection( items, props.source ).map(d=>{
                const out = {...d}
                if( d.relationship ){
                    out.relationship = [d.relationship].flat().map(d=>d.split(":")[0])
                    out.access = [out.relationship].flat().length
                }
                return out
            })
            
            let list = labelled.filter(d=>["title","parameter", "none"].includes(d.type))
            
            let count = 2
            let axis = [...Object.values(props.value ?? {}), ...new Array(count).fill()].slice(0,count)
            console.log(props.value)
            console.log(axis)
            return axis.map((d, axisIdx)=>{
                let active = CollectionUtils.findAxis(d, list)        
                
                return <OptionList 
                options={list} 
                value={active} 
                title 
                name 
                small 
                onChange={async idx=>{
                    const axis = list.find(d=>d.id === idx)
                    if( props.onChange ){
                        await props.onChange( axis, axisIdx )
                    }
                }}
                />
            })
    }   
    let current = Object.values(props.value ?? {}).filter(d=>d)

    return (
    <Headless.Disclosure as="div"
        autoFocus={autoFocus}
        data-slot="control"
        aria-label={ariaLabel}
        className={clsx([
          className,
          // Basic layout
          'group relative block w-full',
          // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
          'before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow',
          // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
          'dark:before:hidden',
          // Hide default focus styles
          'focus:outline-none',
          // Focus ring
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent after:data-[focus]:ring-2 after:data-[focus]:ring-blue-500',
          // Disabled state
          'data-[disabled]:opacity-50 before:data-[disabled]:bg-zinc-950/5 before:data-[disabled]:shadow-none',
        ])}
      >
    {({ open }) => (
        <>
            <Headless.DisclosureButton
                className={clsx([
                    'relative block w-full appearance-none rounded-lg py-[calc(theme(spacing[2.5])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]',
                    small ? 'min-h-9 sm:min-h-7' : 'min-h-11 sm:min-h-9',
                    'pl-[calc(theme(spacing[3.5])-1px)] pr-[calc(theme(spacing.7)-1px)] sm:pl-[calc(theme(spacing.3)-1px)]',
                    'text-left text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
                    'border border-zinc-950/10 group-data-[active]:border-zinc-950/20 group-data-[hover]:border-zinc-950/20 dark:border-white/10 dark:group-data-[active]:border-white/20 dark:group-data-[hover]:border-white/20',
                    'bg-transparent dark:bg-white/5',
                    'group-data-[invalid]:border-red-500 group-data-[invalid]:group-data-[hover]:border-red-500 group-data-[invalid]:dark:border-red-600 group-data-[invalid]:data-[hover]:dark:border-red-600',
                    'group-data-[disabled]:border-zinc-950/20 group-data-[disabled]:opacity-100 group-data-[disabled]:dark:border-white/15 group-data-[disabled]:dark:bg-white/[2.5%] dark:data-[hover]:group-data-[disabled]:border-white/15',
                ])}
                >
                    {!open && (current.length === 0) && <ListboxLabel className='relative'>None</ListboxLabel>}
                    {!open && (current.length > 0) && <div className='relative w-full flex space-x-2'>
                        {current.map(d=><Badge>{d.title}</Badge>)}
                    </div>}
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <PencilSquareIcon className='size-5 stroke-zinc-500 group-data-[disabled]:stroke-zinc-600 sm:size-4 dark:stroke-zinc-400 forced-colors:stroke-[CanvasText]'/>
                </span>
            </Headless.DisclosureButton>
            <Headless.DisclosurePanel>
            <div 
               className={clsx([
                'absolute top-0 left-0 py-1 space-x-2 flex',
                small ? 'min-h-9 sm:min-h-7' : 'min-h-11 sm:min-h-9',
                'pl-[calc(theme(spacing[3.5])-1px)] pr-[calc(theme(spacing.7)-1px)] sm:pl-[calc(theme(spacing.3)-1px)]',
                'text-left text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
                'bg-transparent dark:bg-white/5',
            ])}
            >
                {getOptions()}
            </div>
            </Headless.DisclosurePanel>
        </>
        )}
      </Headless.Disclosure>)
    
}

function MyButton({options, name, title, type, ...props}){
    const control = <Button 
            href={props.href} 
            onClick={props.action ? ()=>props.action() : undefined}
            color="white"
            className={clsx(
                '!font-normal gap-x-1',
                props.small ? '!text-xs' : '!text-sm'
            )}
            >
                {props.icon ?? <></>}
                {title}
        </Button>
    return control
}
function MyDropdown({options, name, title, type, ...props}){
    const control = <Dropdown>
        <DropdownButton 
            color="white"
            className={clsx(
                '!font-normal gap-x-1',
                props.small ? '!text-xs' : '!text-sm'
            )}
            >
                {props.icon ?? <></>}
                {title}
            <ChevronDownIcon className='w-4 h-4'/>
        </DropdownButton>
        <DropdownMenu>
        {options.map(d=>(
            <DropdownItem key={d.id} href={d.href} onClick={props.action ? ()=>props.action(d.id) : undefined}>{d.title}</DropdownItem>
        ))}
        </DropdownMenu>
    </Dropdown>
    return control
}
function Panel(props){
    return (
      <Disclosure defaultOpen={props.open}>
      {({ open }) => (
        <div className={`group/panel ${props.className || ""}`}>
            <Disclosure.Button as='div' key="title" className={`flex w-full space-x-2 place-items-center`} >
                {props.icon ? props.icon : <></>}
                <p>{props.title}</p>
                <ChevronRightIcon strokeWidth={2} className={`${props.narrow ? "" :"!ml-auto !mr-0"} w-5 h-5 ${open ? '-rotate-90 transform' : ''}`}/>
            </Disclosure.Button>
        <Disclosure.Panel className={props.panelClassName}>
            {typeof(props.children) === "function" ? props.children() : props.children}
        </Disclosure.Panel>
        </div>
      )}
      </Disclosure>
    )
}
function OptionList({options, name, title, type, ...props}){
    const control = <Listbox name={name} value={props.value} defaultValue={props.defaultValue ?? props.default} onChange={props.onChange} placeholder={props.placeholder} zIndex={props.zIndex} small={props.small}>
        {options.map(d=>(
            <ListboxOption value={d.id} small={props.small ? true : false}>
                {d.icon && <HeroIcon icon={d.icon} className='w-4 h-4'/>}
                <ListboxLabel key={d.id}>{d.title}</ListboxLabel>
                {props.showCount && <span className="inline-flex items-center rounded-full bg-gray-200 px-1.5 ml-3 text-[0.625rem] font-medium text-gray-600">{d.count ?? 0}</span>}
            </ListboxOption>
        ))}
    </Listbox>
    if( title ){
        return (
            <Headless.Field>
              <Label>{title}</Label>
              {control}
            </Headless.Field>)
    }
    return control
}
export default function UIHelper(props){
    if( props.type === "option_list"){
        return OptionList(props)
    }
}
UIHelper.OptionList = OptionList
UIHelper.Dropdown = MyDropdown
UIHelper.Panel = Panel
UIHelper.Button = MyButton
UIHelper.AxisPicker = AxisPicker