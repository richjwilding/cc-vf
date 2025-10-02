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
  Chip,
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
import MainStore from "./MainStore";

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
  const [userSearch, setUserSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const mainstore = MainStore();
  const orgUsers = mainstore.activeOrganization?.members?.map(m => mainstore.user(m.userId)).filter(Boolean) ?? [];

  useEffect(()=>{
     if (!isOpen) return
    setTitle(workspace?.title ?? '');
    setDescription(workspace?.description ?? '');
    setStatus(workspace?.description ?? '');
    setCompany(workspace.company ?? "");
    setColor(workspace?.color ?? 'slate');
    setLogoUrl(workspace?.logoUrl);
    setTags(workspace?.tags ?? []);
    setSelectedUsers((workspace?.users ?? []).map(u => typeof u === "string" ? mainstore.user(u) || {id: u} : u));
    setUpdating(false)
    console.log("reset")
  }, [isOpen, workspace, newWorkspace])

  const { logo: companyLogo, color: companyColor, palette: companyPalette } = useCompanyLogo({company})
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

   const addExistingUser = (key) => {
    const user = orgUsers.find(u => u.id === key);
    if (user && !selectedUsers.some(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const addExternalUser = () => {
    const email = inviteEmail.trim();
    if (email && !selectedUsers.some(u => (u.email || u.id) === email)) {
      setSelectedUsers([...selectedUsers, { email }]);
    }
    setInviteEmail("");
  };

  const removeUser = (key) => {
    setSelectedUsers(selectedUsers.filter(u => (u.id || u.email) !== key));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const data = {
      organizationId: MainStore().activeOrganization?.id,
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
                <div className="col-span-3 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedUsers.map(u => {
                      const key = u.id || u.email;
                      return (
                        <Chip
                          key={key}
                          onClose={() => removeUser(key)}
                          startContent={
                            <Avatar
                              size="sm"
                              src={u.avatarUrl}
                              name={u.name || u.email}
                              imgProps={{ referrerPolicy: 'no-referrer' }}
                            />
                          }
                        >
                          {u.name || u.email}
                        </Chip>
                      );
                    })}
                  </div>
                  <Autocomplete
                    label="Add team member"
                    labelPlacement="outside"
                    placeholder="Search users"
                    selectedKey={null}
                    inputValue={userSearch}
                    onInputChange={setUserSearch}
                    onSelectionChange={(key) => {
                      addExistingUser(key);
                      setUserSearch('');
                    }}
                  >
                    {orgUsers.map(user => (
                      <AutocompleteItem key={user.id} textValue={user.name}>
                        <div className="flex items-center gap-2">
                          <Avatar
                            size="sm"
                            src={user.avatarUrl}
                            name={user.name}
                            imgProps={{ referrerPolicy: 'no-referrer' }}
                          />
                          <span>{user.name}</span>
                        </div>
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      label="Invite by email"
                      labelPlacement="outside"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExternalUser(); } }}
                      placeholder="name@example.com"
                    />
                    <Button className="mt-auto" variant="flat" onPress={addExternalUser}>Add</Button>
                  </div>
                </div>
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
