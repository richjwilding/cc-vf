import { Select, SelectItem } from '@heroui/react'

export default function MyCombo({selectedItem, setSelectedItem, ...props}) {
  return <Select
    className="w-full"
    label={props.title}
    size="sm"
    variant="bordered"
    selectedKeys={[selectedItem].flat().filter(Boolean)}
    disallowEmptySelection={true}
    onSelectionChange={(v) => {
      const keys = Array.from(v)[0]
      setSelectedItem( keys )
    }}>
      {props.items.map(d=><SelectItem key={d.id}>{d.title}</SelectItem>)}
  </Select>
  //return <UIHelper.OptionList options={props.items} zIndex="50" onChange={setSelectedItem} value={selectedItem} showCount={props.showCount} small={true} />
}

