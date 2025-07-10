import {Card, CardHeader, CardBody, Button, Avatar, Tabs, Tab, Chip, AvatarGroup, Tooltip, ScrollShadow} from "@heroui/react";
import MainStore from "./MainStore";
import { Logo } from "./logo";
import { useEffect, useReducer, useRef, useState } from "react";
import { Vibrant } from "node-vibrant/browser";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useCompanyLogo } from "./@components/CompanyLogo";
import { useSmoothGradient } from "./@components/SmoothGradient";
import useDataEvent from "./CustomHook";




export default function WorkspaceCard({workspace, openSettings, onPress}) {
  const usersForWorkspace = MainStore().users().filter(d=>d.workspaces?.includes(workspace.id))
  const {gradient} = useSmoothGradient(workspace?.color ?? "slate", 400);
  useDataEvent("workspace_updated", [workspace?.id])


  let logo
  if( workspace.logoUrl ){
    logo = <Avatar
      isBordered={true}
      className="h-20 w-20 translate-y-12 logo"
      src={workspace.logoUrl}
    />
  }else{
          logo = <Logo className={`logo w-20 h-20 shrink-0 mr-1 bg-white rounded-full translate-y-12 text-${workspace.color}-500 p-1 border-2`}/>

  }

  return (
    <div className="mx-6 my-4 flex h-[360px] w-[400px] items-start justify-center">
      <Card isPressable={true} isHoverable={true} onPress={onPress} className="w-full h-full">
        <CardHeader 
            className="relative flex h-[100px] flex-col justify-end overflow-visible "
             style={{ backgroundImage: gradient }}
             >
          {logo}
          <Button
            className="absolute right-3 top-3 bg-white/30 text-white dark:bg-black/30"
            radius="full"
            size="sm"
            isIconOnly={true}
            variant="light"
            onPress={openSettings ? ()=>openSettings( workspace) : undefined}
          >
            <Icon icon="solar:menu-dots-bold" className="w-6 h-6"/>
          </Button>
        </CardHeader>
        <CardBody className="min-h-0">
          <div className="pb-4 pt-6 min-h-0 flex flex-col grow">
            <p className="text-large font-medium">{workspace.title}</p>
            {workspace.tags?.length > 0 && <div className="flex gap-2 pb-1 pt-2 h-9 overflow-hidden shrink-0">
              {(workspace.tags ?? []).map(d=><Chip key={d} variant="flat" size="sm">{d}</Chip>)}
            </div>}
            <ScrollShadow className="overflow-y-hidden">
              <p className="py-2 text-small text-foreground flex-shrink overflow-y-scroll">
                {workspace.description}
              </p>
            </ScrollShadow>
          </div>
            <div className="flex gap-2 mb-4">
              <p>
                <span className="text-small font-medium text-default-500">13</span>&nbsp;
                <span className="text-small text-default-400">Following</span>
              </p>
              <p>
                <span className="text-small font-medium text-default-500">2500</span>&nbsp;
                <span className="text-small text-default-400">Followers</span>
              </p>
            </div>
          <AvatarGroup max={3} size="sm" total={usersForWorkspace.length > 3 ? usersForWorkspace.length - 3 : undefined} disableAnimation
                    classNames={{
                      count: "data-[hover=true]:translate-x-0 data-[hover=true]:transition-none"
                    }}>
            {usersForWorkspace.map(d=>(
              <Tooltip content={d.name} placement="bottom">
                  <Avatar 
                    disableAnimation 
                    key={d.id} 
                    src={d.avatarUrl} 
                    showFallback 
                    name={d.name}
                    classNames={{
                      base: "data-[hover=true]:translate-x-0 data-[hover=true]:transition-none"
                    }}
                    imgProps={{ "referrerPolicy": 'no-referrer'}}/>
              </Tooltip>
            ))}
          </AvatarGroup>
        </CardBody>
      </Card>
    </div>
  );
}
