"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
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
  CardFooter,
  Chip,
} from "@heroui/react";
import {Icon} from "@iconify/react";
import TagsInput from "./@components/TagsInput";
import { useSmoothGradient } from "./@components/SmoothGradient";
import { useCompanyLogo } from "./@components/CompanyLogo";
import { DebouncedInput } from "./@components/DebouncedInput";
import { ColorSelector } from "./@components/ColorSelector";
import colors from 'tailwindcss/colors';
import useDataEvent from "./CustomHook";
import WorkflowCard from "./WorkflowCard";
import { useNavigate } from "react-router-dom";
import MainStore from "./MainStore";
import clsx from "clsx";
import { format, parseISO } from "date-fns";
import { ClockIcon } from "@heroicons/react/24/outline";
import { SparklesIcon } from "@heroicons/react/20/solid";
import BaseFlowPicker from "./BaseFlowPicker";

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


export default function FlowInstanceEditor({flowInstance, isOpen, onClose, ...props}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('');
    const [tags, setTags] = useState( []);
    const [showWorking, setShowWorking] = useState(false)
    const [showPicker, setShowPicker] = useState(false)
    const [selectedWorkflow, setSelectedWorkflow] = useState()
    const navigate = useNavigate()        
    const mainstore = MainStore()


    useEffect(()=>{
        if (!isOpen) return
        setTitle(flowInstance?.title ?? '');
        setDescription(flowInstance?.referenceParameters?.description ?? '');
        setStatus(flowInstance?.referenceParameters?.status ?? '');
        setTags(flowInstance?.referenceParameters?.tags ?? []);
        setSelectedWorkflow(flowInstance ? flowInstance.origin : undefined)
        setShowWorking(false)
    }, [isOpen])

    async function importFlowTemplate(p){
        const target = MainStore().activeWorkspaceId
        if(p.isTemplate && target){
            const result = await fetch(`/api/workflow/${target}/import/${p.id}`,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            const response = await result.json()
            console.log(response)
            return response?.result?.replicatedSeedId
        }
    }

    async function handleCreate(){
        let sourceWorkflow
        setShowWorking(true)
        if( selectedWorkflow.isTemplate ){
            const newId = await importFlowTemplate( selectedWorkflow )
            sourceWorkflow = await mainstore.waitForPrimitive( newId )
        }else{
            sourceWorkflow = selectedWorkflow
        }
        await mainstore.doPrimitiveAction(sourceWorkflow, "create_flowinstance", {data: {title, description, tags, status}},async (data)=>{
            const newId = data?._id
            const flowInstance = await mainstore.waitForPrimitive( newId )
            console.log(`Got new flowInstance ${flowInstance.plainId}`)
            onClose?.()
            navigate(`/item/${flowInstance.id}`)
        })
    }

    const changes = useMemo(()=>{
      if(flowInstance){
        const changes = title !== (flowInstance.title  ?? "") || status !== (flowInstance.referenceParameters.status ?? "") || (description !== flowInstance.referenceParameters.description  ?? "") || tags !== (flowInstance.referenceParameters.tags ?? [])
        return changes
      }
      return false
    }, [title, description, status, tags, selectedWorkflow, isOpen])

    async function handleSave(){
      if( changes ){
        if( title !== (flowInstance.title ?? "")){
          flowInstance.title = title
        }
        const update = {
          ...flowInstance.referenceParameters,
          status,
          description,
          tags
        } 
        flowInstance.setField("referenceParameters", update)
      }
      onClose?.()
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
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  className="col-span-2"
                  isRequired
                  label="Title"
                  labelPlacement="outside"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Enter title"
                />
                <Select
                  isRequired
                  label="Status"
                  labelPlacement="outside"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  placeholder="Enter title"
                  defaultSelectedKeys={["active"]}
                >
                  <SelectItem key="draft">Draft</SelectItem>
                  <SelectItem key="active">Active</SelectItem>
                  <SelectItem key="complete">Complete</SelectItem>
                </Select>

                 <Textarea 
                  fullWidth={true}
                  isRequired 
                  className="col-span-3" 
                  label="Description" 
                  labelPlacement="outside" 
                  placeholder="Enter description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                <TagsInput label="Tags" className="col-span-3" labelPlacement="outside" value={tags} onChange={setTags}/>
                 <Card fullWidth={true} 
                    shadow="none"
                    className="col-span-3 tap-highlight-transparent px-3 gap-3 bg-default-100 hover:bg-default-200 group-data-[focus=true]:bg-default-100 !h-auto transition-background motion-reduce:transition-none !duration-150 outline-none group-data-[focus-visible=true]:z-10 group-data-[focus-visible=true]:ring-2 group-data-[focus-visible=true]:ring-focus group-data-[focus-visible=true]:ring-offset-2 group-data-[focus-visible=true]:ring-offset-background py-2"
                    >
                    <CardHeader className="justify-between">
                        <div className="flex gap-5">
                            {!selectedWorkflow && <h4 className="text-small font-semibold leading-none text-default-500">Select template</h4>}
                            {selectedWorkflow && <div className="flex flex-col gap-1 items-start justify-center">
                                <h4 className="text-small font-semibold leading-none text-default-600">{selectedWorkflow.title}</h4>
                                <h5 className="text-small tracking-tight text-default-400">W-{selectedWorkflow.plainId} - Co-Created</h5>
                            </div>}
                        </div>
                        {!flowInstance && <Button
                          onPress={()=>setShowPicker(true)}
                          color="secondary"
                          radius="full"
                          size="sm"
                          >
                              {selectedWorkflow ? "Change" : "Select"}
                        </Button>}
                    </CardHeader>
                    {selectedWorkflow && <CardBody className="py-0 text-small text-default-400">
                        <p>{selectedWorkflow.referenceParameters?.description}</p>
                        {selectedWorkflow.referenceParameters?.tags && <div className="flex space-x-1 mt-2">{selectedWorkflow.referenceParameters.tags.map(d=><Chip size="sm">{d}</Chip>)}</div>}
                    </CardBody>}
                    {selectedWorkflow && <CardFooter className="gap-3">
                        <div className="flex gap-1 place-items-center">
                            <SparklesIcon className="w-4 h-4 text-default-400"/>
                            <p className="text-default-400 text-small">{selectedWorkflow.referenceParameters?.credits} Credits</p>
                        </div>
                        <div className="flex gap-1 place-items-center">
                            <ClockIcon className="w-4 h-4 text-default-400"/>
                            <p className="text-default-400 text-small">{selectedWorkflow.referenceParameters?.duration}</p>
                        </div>
                        {selectedWorkflow.published?.published_date && <Chip size="sm" variant="bordered">{format(parseISO(selectedWorkflow.published?.published_date), 'MMMM do yyyy')}</Chip>}
                    </CardFooter>}
                </Card>
              </div>
              <BaseFlowPicker isOpen={showPicker} onClose={()=>setShowPicker(false)} selectedWorkflow={selectedWorkflow} onSelectWorkflow={setSelectedWorkflow}/>
              <div className="flex w-full justify-end gap-2">
                <Button radius="full" variant="bordered" onPress={onClose}>
                  Cancel
                </Button>
                {flowInstance && <Button isDisabled={!changes} color="primary" radius="full" onPress={handleSave} startContent={showWorking ? <Spinner size='sm' classNames={{circle1:"border-b-white"}}/> : undefined}>
                  Save changes
                </Button>}
                {!flowInstance && <Button isDisabled={!selectedWorkflow || title.trim() === ""} color="primary" radius="full" onPress={handleCreate} startContent={showWorking ? <Spinner size='sm' classNames={{circle1:"border-b-white"}}/> : undefined}>
                  Create
                </Button>}
              </div>
      </ModalBody>
    </ModalContent>
  </Modal>
  );
}
