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
} from "@heroui/react";
import {Icon} from "@iconify/react";
import TagsInput from "./@components/TagsInput";
import { useSmoothGradient } from "./@components/SmoothGradient";
import { useCompanyLogo } from "./@components/CompanyLogo";
import { DebouncedInput } from "./@components/DebouncedInput";
import { ColorSelector } from "./@components/ColorSelector";
import colors from 'tailwindcss/colors';
import useDataEvent from "./CustomHook";

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


export default function WorkspaceEditor({isOpen, onClose, workspace, newWorkspace, ...props}) {
  const [title, setTitle] = useState(workspace?.title ?? '');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [status, setStatus] = useState(workspace?.status ?? '');
  const [company, setCompany] = useState(workspace.company ?? "");
  const [logoUrl, setLogoUrl] = useState(workspace?.logoUrl );
  const [color, setColor] = useState(workspace?.color ?? 'slate');
  const [tags, setTags] = useState(workspace?.tags ?? []);
  const [selectedUsers, setSelectedUsers] = useState(workspace?.users || []);
  const [updating, setUpdating] = useState(false);

  useEffect(()=>{
     if (!isOpen) return
    setTitle(workspace?.title ?? '');
    setDescription(workspace?.description ?? '');
    setStatus(workspace?.description ?? '');
    setCompany(workspace.company ?? "");
    setColor(workspace?.color ?? 'slate');
    setLogoUrl(workspace?.logoUrl);
    setTags(workspace?.tags ?? []);
    setSelectedUsers(workspace?.users ?? []);
    setUpdating(false)
    console.log("reset")
  }, [isOpen, workspace, newWorkspace])

  const { logo: companyLogo, color: companyColor, palette: companyPalette } = useCompanyLogo(company)
  const {gradient} = useSmoothGradient(color, 400);

  let logoComponent
  if( logoUrl ){
    logoComponent = <Avatar
      isBordered={true}
      className="h-20 w-20 logo"
      src={logoUrl}
    />

  }
  let palette = companyPalette?.length > 0 ? companyPalette : basePalette

  useEffect(()=>{
    if( companyLogo ){
      setLogoUrl(companyLogo.src)
      setColor( companyColor )
    }
  },[companyLogo?.src, companyColor])

  const handleSubmit = async (event) => {
    event.preventDefault();

    const data = {
      title,
      description,
      status,
      company,
      logoUrl,
      color,
      tags,
      users: selectedUsers,
    };
    try{
      setUpdating(true)
      if( newWorkspace ){
        const result = await fetch(`/api/workspace/new`,{
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        })
        const response = await result.json()

        console.log(response)
/*            if( obj.ajaxResponseHandler( result )){
              obj.triggerCallback('set_user', [receiver])
            }*/
      }else{
        const result = await fetch(`/api/workspace/${workspace.id}/update`,{
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        })
        const response = await result.json()

        console.log(response)
      }
      setUpdating(false)
      onClose?.()
    }catch(err){
      console.log(err)
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Create new project
          {false && <p className="text-small text-default-500">
            Start from a template or create a custom project
          </p>}
        </ModalHeader>
        <ModalBody>
          <div 
              className="relative flex h-[100px] flex-col justify-center place-items-center overflow-visible rounded-md shadow-sm"
              style={ gradient ? { backgroundImage: gradient } : {}}
              >
            {logoComponent}
            <ColorSelector palette={palette} value={color} onChange={setColor} className="absolute top-2 right-2"/>
          </div>
            {isOpen && <Form validationBehavior="native" onSubmit={handleSubmit}>
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
                <TagsInput label="Tags" labelPlacement="outside" value={tags} onChange={setTags}/>
                <DebouncedInput Input
                  label="Company"
                  labelPlacement="outside"
                  value={company}
                  onChange={value => setCompany(value)}
                  placeholder="Enter Company"
                />
              </div>

              <div className="mt-6 flex w-full justify-end gap-2">
                <Button radius="full" variant="bordered" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" radius="full" type="submit" startContent={updating ? <Spinner size='sm' classNames={{circle1:"border-b-white"}}/> : undefined}>
                  Save Changes
                </Button>
              </div>
            </Form>}
      </ModalBody>
    </ModalContent>
  </Modal>
  );
}
