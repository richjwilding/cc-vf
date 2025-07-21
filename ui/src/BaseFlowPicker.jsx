"use client";

import React, { useEffect, useReducer, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Avatar,
  Badge,
  Input,
  Autocomplete,
  AutocompleteItem,
  Form,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Textarea,
  Select,
  SelectItem,
  Spinner,
  ScrollShadow,
  Tabs,
  Tab,
} from "@heroui/react";
import colors from 'tailwindcss/colors';
import WorkflowCard from "./WorkflowCard";
import MainStore from "./MainStore";
import clsx from "clsx";

const basePalette =  [
            "red",
            "orange",
            "amber",
            "yellow",
            "lime",
            "green",
            "emerald",
            "teal",
            "cyan",
            "sky",
            "blue",
            "indigo",
            "violet",
            "purple",
            "fuchsia",
            "pink",
            "rose"
          ].map(d=>({name: d, color: colors[d][500]}))


export default function BaseFlowPicker({isOpen, onClose, selectedWorkflow, onSelectWorkflow, ...props}) {
    const mainstore = MainStore()
    const [activeTab, setActiveTab ] = useState( "library" )
    const [localSelectedWorkflow, setLocalSelectedWorkflow] = useState(selectedWorkflow)

    useEffect(()=>{
      setLocalSelectedWorkflow(selectedWorkflow)
    }, [selectedWorkflow?.id, isOpen])


    const templates = MainStore().templates().filter(d=>d.type === "flow")
    const workflows = MainStore().primitives().filter((p)=>p.workspaceId === mainstore.activeWorkspaceId && p.type==="flow" && !p.inFlow)
    const templateToShow = templates.filter(d=>!workflows.find(d2=>d2.replication?.source === d.id))

    const createList = activeTab === "library" ? workflows : templateToShow

    function handlePress(){
      onSelectWorkflow?.( localSelectedWorkflow)
      onClose()
    }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Create new flow
          {false && <p className="text-small text-default-500">
            Start from a template or create a custom project
          </p>}
        </ModalHeader>
        <ModalBody>
            <div className="w-full flex overflow-x-scroll shadow-inner border rounded-xl flex flex-col space-y-2 p-2">
                <Tabs fullWidth="true" selectedKey={activeTab} onSelectionChange={((id)=>setActiveTab(id))}>
                    <Tab
                        key="library"
                        title="Existing flows"
                    />
                    <Tab
                        key="templates"
                        title="Explore templates"
                    />
                </Tabs>
                <ScrollShadow
                    hideScrollBar
                    orientation="horizontal"
                >
                    {createList.length === 0 && <div className="h-72 m-2 w-full rounded-xl bg-default-100 text-default-600 justify-center place-items-center flex"><p>Nothing to show</p></div>}
                    {createList.length > 0 && <div className="w-fit flex gap-4 p-4">
                        {createList.map((p)=>{
                            return <WorkflowCard 
                                        primitive={p} 
                                        className={clsx([
                                            localSelectedWorkflow?.id === p.id ? "ring-2 ring-offset-2 ring-primary-500 !shadow-lg" : ""
                                        ])}
                                        onClick={()=>{
                                /*if( p.isTemplate ){
                                    importFlowTemplate( p )
                                }else{
                                    navigate(`/workflow/${p.id}/new_instance`)
                                }*/
                               console.log(p.id)
                               setLocalSelectedWorkflow( p )
                            }}/>
                        })}
                    </div>}
                </ScrollShadow>
            </div>
              <div className="flex w-full justify-end gap-2">
                <Button radius="full" variant="bordered" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" radius="full" type="submit" onPress={handlePress}>
                  Ok
                </Button>
              </div>
      </ModalBody>
    </ModalContent>
  </Modal>
  );
}
