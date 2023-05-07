import React from 'react';
import { RadioGroup, Transition } from '@headlessui/react'
import { ComponentRow } from './ComponentRow';
import { Switch } from '@headlessui/react'

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
  }

export function ComponentView(props) {
  let [compact, setCompact] = React.useState(false)
  let [evidenceDetail, setEvidenceDetail] = React.useState(false)
    return (
      <div className='overflow-y-auto w-full'>
        <div className = 'bg-gray-100 w-fill h-fill'>
            <div className='flex'>
        <Switch.Group as="div" className="flex justify-end p-4 inline">
            <Switch
                checked={evidenceDetail}
                onChange={setEvidenceDetail}
                className={classNames(
                    evidenceDetail ? 'bg-indigo-600' : 'bg-gray-200',
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                )}
                >
                <span className="sr-only">Use setting</span>
                <span
                    aria-hidden="true"
                    className={classNames(
                        evidenceDetail ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                    )}
                />
            </Switch>
            <Switch.Label as="span" className="ml-3">
                <span className="text-sm font-medium text-gray-900">Show evidence detail</span>
            </Switch.Label>
        </Switch.Group>
        <Switch.Group as="div" className="flex justify-end p-4">
            <Switch
                checked={compact}
                onChange={setCompact}
                className={classNames(
                    compact ? 'bg-indigo-600' : 'bg-gray-200',
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                )}
                >
                <span className="sr-only">Use setting</span>
                <span
                    aria-hidden="true"
                    className={classNames(
                        compact ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                    )}
                />
            </Switch>
            <Switch.Label as="span" className="ml-3">
                <span className="text-sm font-medium text-gray-900">Hide assessment text</span>
            </Switch.Label>
        </Switch.Group>
        </div>
            <ul role="list"  className="w-full p-4 pt-0 mx-auto">
            { props.components.map((c) => <ComponentRow selectPrimitive={props.selectPrimitive} compact={props.compact} evidenceDetail={evidenceDetail} key={c.id} component={c}/>)}
            </ul>
        </div>
      </div>
    )
}