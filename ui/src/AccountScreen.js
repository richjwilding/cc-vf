import React, { Fragment, useEffect, useMemo, useReducer, useState } from "react";
import {Card, CardHeader, CardBody, Button, Avatar, Tabs, Tab, Chip, Divider, DropdownMenu, Dropdown, DropdownTrigger, Input, DropdownItem, RadioGroup, Badge} from "@heroui/react";
import MainStore from "./MainStore";
import { useNavigate, useParams } from "react-router-dom";
import useDataEvent from "./CustomHook";
import { useCompanyLogo } from "./@components/CompanyLogo";
import { useSmoothGradient } from "./@components/SmoothGradient";
import { DebouncedInput } from "./@components/DebouncedInput";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BarChart, Bar, Rectangle, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  format,
  differenceInCalendarDays,
  addMinutes,
  parseISO,
  addMonths,
  startOfToday,
  addHours,
} from 'date-fns'
import CheckoutButton from "./@components/CheckoutButton";
import BillingPortalButton from "./@components/BillingPortalButton";
import PlanRadio from "./@components/plan-radio";
import { main } from "@popperjs/core";

 const permissionLabels = {
    "viewer": "Viewer",
    "editor": "Editor",
    "admin": "Admin",
  };

export default function AccountScreen(props){    
    const mainstore = MainStore()
    const navigate = useNavigate()        
    const {id} = useParams()
    const [update, forceUpdate] = useReducer(x=>x+1)
    const {logo, color, palette} = useCompanyLogo( {url: mainstore.activeOrganization?.avatarUrl } )
    const {gradient} = useSmoothGradient(color ?? "slate", 400);
    const [companyName, setCompanyName] = useState( mainstore.activeOrganization?.name )
    const [organizationUsage, setOrganizationUsage] = useState(false)
    const [selectedKeys, setSelectedKeys] = React.useState(new Set(["viewer"]));
    const [localActivePlanId, setLocalActivePlanId] = React.useState( mainstore.activeOrganization.activePlanId )

    const organizationInfo = mainstore.activeOrganization ?? []
    const planInfo = organizationInfo.plan ?? {}
    const today = startOfToday()

    useEffect(()=>{
        fetch(`/api/organizations`,{
            method: 'get',
            }).then(d=>d.json()).then(org=>{
                setOrganizationUsage( org[0] )
            })
    },[])    


    const usageData = useMemo(()=>{
        if( organizationUsage ){

            let start, end, track = {}
            const usage = organizationUsage.usage ?? []
            const dates = usage.map(d=>d.timestamp).filter(Boolean)
            const parsed = dates.map(parseISO).sort((a, b) => a - b)
            
            const fmt = 'yyyy-MM-dd HH'
            
            // bucket counts
            const counts = usage.reduce((acc, d) => {
                const key = format(parseISO(d.timestamp), fmt)
                //acc[key] = (acc[key] || 0) + d.delta
                acc[key] = d.post ?? 0
                return acc
            }, {})
            
            // build full day range
            const from = parsed[0]
            const to   = addHours(parsed[parsed.length - 1],1)
            if(from && to ){
                let d = from
                const data = []
                while( d <= to){
                    data.push({
                        name:   format(d, fmt),
                        count: counts[format(d, fmt)] || 0
                    })
                    d = addHours(d, 1)
                }
                return data
            }
            return []
        }
    }, [organizationUsage?.usage?.length])

    const userInfo = useMemo(()=>{
        return organizationInfo.members.map(member=>{
            const user = mainstore.users().find(d=>d._id === member.userId)
            return {
                id: member.userId,
                avatar: user?.avatarUrl,
                name: user?.name ?? "Anonymous user",
                email: user?.email ?? "Anonymous email",
                role: member.role
            }
        })
    })

    useDataEvent('new_primitive delete_primitive',undefined, forceUpdate)


    let next = new Date(today.getFullYear(), today.getMonth(), planInfo.renews_day)
    if (next < today) {
        next = addMonths(next, 1)
    }

    const daysAway = differenceInCalendarDays(next, today)
    const nextRenewal = new Date(2000, 0, planInfo.renews_day)

    //const renewMesage = `Renews on the ${format(nextRenewal, "do")} of each month  (${daysAway} ${daysAway > 1 ? "days" : "day"} away)`

    return ( 
    <div className="flex h-full  w-full items-start justify-center overflow-scroll">
      <Card className="md:my-10 w-full md:max-w-3xl lg:max-w-4xl">
        <CardHeader 
            className="relative flex h-[100px] flex-col justify-end overflow-visible "
             style={{ backgroundImage: gradient }}
             >
          <Avatar
            className="h-20 w-20 translate-y-12"
            src={logo?.src}
          />
        </CardHeader>
        <CardBody>
              <div className="flex flex-col w-full space-y-2 mt-12 px-3 mb-6">
                  <div className="w-full grid grid-cols-[1fr_3fr_min-content] gap-2">
                    <p className="text-small text-default-500">Details</p>
                    <DebouncedInput Input
                        label="Name"
                        size="sm"
                        fullWidth={true}
                        labelPlacement="outside"
                        value={companyName}
                        classNames={{
                            mainWrapper: "w-full",
                            inputWrapper:"shadow-none",
                        }}
                        onChange={value => setCompanyName(value)}
                        placeholder="Enter Company"
                    />
                    <Button size="sm" isDisabled variant="flat" fullWidth={true} className="place-self-end">Update</Button>
                    <Divider className="col-span-3 my-3"/>
                    <p className="text-small text-default-500 row-span-2">Plan</p>

                    <RadioGroup aria-label="Plans" classNames={{wrapper: "gap-3"}} value={localActivePlanId} onValueChange={setLocalActivePlanId}>
                        {(mainstore.activeOrganization?.validPlans ?? []).map(plan=>
                            <PlanRadio
                                description={plan.featureDescription}
                                current={mainstore.activeOrganization.activePlanId === plan._id}
                                icon={
                                    <Icon className="text-secondary" icon="solar:box-minimalistic-linear" width={18} />
                                }
                                label={plan.name}
                                monthlyPrice={plan.price}
                                value={plan._id}
                            />
                        )}
                    </RadioGroup>

                    <CheckoutButton isDisabled={true} size="sm"/>
                    {mainstore.activeOrganization.billing?.stripe?.subscriptionId &&  <BillingPortalButton/>}
                    <Divider className="col-span-3 my-3"/>
                    <p className="text-small text-default-500">Users</p>
                    <div className="">
                        <Input
                            size="sm"
                            classNames={{
                                inputWrapper:"shadow-none",
                                helperWrapper: "absolute -bottom-6",
                            }}
                            endContent={
                                <Dropdown>
                                    <DropdownTrigger>
                                        <Button
                                        className="text-default-500"
                                        endContent={
                                            <span className="hidden sm:flex">
                                            <Icon icon="solar:alt-arrow-down-linear" />
                                            </span>
                                        }
                                        size="sm"
                                        variant="light"
                                        >
                                        {Array.from(selectedKeys)
                                            .map((key) => permissionLabels[key])
                                            .join(", ")}
                                        </Button>
                                    </DropdownTrigger>
                                    <DropdownMenu
                                        selectedKeys={selectedKeys}
                                        selectionMode="single"
                                        onSelectionChange={setSelectedKeys}
                                    >
                                        {Object.entries(permissionLabels).map(([k,v])=>
                                            <DropdownItem key={k}>{v}</DropdownItem>
                                        )}
                                    </DropdownMenu>
                                </Dropdown>
                            }
                            label="Email Address"
                            labelPlacement="outside"
                            name="email"
                            placeholder="Email comma separated"
                            type="email"
                        />
                        <div className="grid p-3 grid-cols-[1fr_min-content_min-content] my-1">
                            {userInfo.map(user=>
                                <Fragment key={user.id}>
                                    <div className="flex items-center gap-2">
                                        <Avatar size="sm" src={user.avatar} />
                                        <p className="text-small text-default-500">{user.name}</p>
                                    </div>
                                    <p className="text-small text-default-400 place-content-center">{user.role}</p>
                                    <Icon icon="solar:trash-bin-trash-linear" className="place-self-center ml-2 text-default-400" />
                                    <Divider className="col-span-3 my-1.5"/>
                                </Fragment>
                            )}
                        </div>
                    </div>
                    <Button size="sm" isDisabled variant="flat" className="mt-[1.375rem]">Invite</Button>
                    <Divider className="col-span-3 my-3"/>
                    <p className="text-small text-default-500">Usage</p>
                    <ResponsiveContainer width="100%" height={300} className="col-span-2">
                        <BarChart
                            data={usageData}
                            margin={{
                                top: 5,
                                right: 30,
                                left: 20,
                                bottom: 5,
                            }}
                            >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#8884d8" activeBar={<Rectangle fill="pink" stroke="blue" />} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </CardBody>
      </Card>
    </div>
  )
}