import { Select, SelectItem } from "@heroui/react";
import clsx from "clsx";
import colors from 'tailwindcss/colors';

export function ColorSelector({ palette, value, onChange, className }) {

    const valueToLookup = value?.startsWith("#") ? value : colors[value]?.[500]

    const keys = palette.find(d=>d.color === valueToLookup) ? [valueToLookup] : []
    function handleChange(e){
        onChange?.(e.target.value)
    }
  return (
  <Select 
        aria-label="Choose color"
        selectedKeys={keys}
        onChange={handleChange}
        fullWidth={false} 
        size="sm"
        className={clsx(className, "inline-flex w-auto p-0 max-w-12 min-w-12")} 
        classNames={{
            mainWrapper: "max-w-12",
            selectorIcon: "end-0.5",
            innerWrapper:"w-[calc(100%_-_4em]"
        }}
        renderValue={(items)=>{
            return items.map(d=><div key={d.key} className="w-5 h-5 border border-black" style={{background: d.key}}/>)
        }}>
        {palette.map(d=>(
            <SelectItem 
                key={d.color}
                textValue={d.color}
                >
                    <div className="w-5 h-5 border border-black" style={{background: d.color}}/>
                </SelectItem>
        ))}
    </Select>
  );
}