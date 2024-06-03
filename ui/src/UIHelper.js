import * as Headless from '@headlessui/react'
import { Listbox, ListboxOption, ListboxLabel } from "./@components/listbox"
import { Label } from "./@components/fieldset"

function OptionList({options, name, title, type, ...props}){
    const control = <Listbox name={name} value={props.value} defaultValue={props.defaultValue ?? props.default} onChange={props.onChange} placeholder={props.placeholder}>
        {options.map(d=>(
            <ListboxOption value={d.id}>
                <ListboxLabel>{d.title}</ListboxLabel>
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