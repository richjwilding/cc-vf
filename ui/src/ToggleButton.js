import { Switch } from '@heroui/react'
import { useEffect, useState } from 'react'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function TooggleButton(props) {
  return <Switch
              size="sm" 
              variant={props.variant ?? "bordered"}
              isSelected={props.enabled} 
              onValueChange={props.setEnabled}>{props.title}</Switch>
  /*const [enabled, setEnabled] = useState(props.enabled)

  function handleChange(){
    const newState = !enabled
    setEnabled(newState)
    if(props.setEnabled){
      props.setEnabled(newState)
    }
  }

  useEffect(()=>{
    setEnabled(props.enabled)
  }, [props.enabled])

  return (
    <Switch.Group as="div" className={`flex items-center ${props.className}`}>
      <Switch
        checked={enabled}
        onChange={handleChange}
        className={classNames(
          enabled ? 'bg-indigo-600' : 'bg-gray-200',
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2'
        )}
      >
        <span
          aria-hidden="true"
          className={classNames(
            enabled ? 'translate-x-5' : 'translate-x-0',
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
          )}
        />
      </Switch>
      <Switch.Label as="span" className="ml-3 text-sm">
        <span className="font-medium">{props.title}</span>
      </Switch.Label>
    </Switch.Group>
  )*/
}
