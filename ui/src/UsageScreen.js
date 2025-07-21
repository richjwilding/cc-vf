import { useEffect, useMemo, useReducer, useState } from "react"
import MainStore from "./MainStore"
import { useNavigate, useParams } from 'react-router-dom';
import useDataEvent from "./CustomHook"
import { BarChart, Bar, Rectangle, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { addMinutes, addSeconds, eachDayOfInterval, eachMinuteOfInterval, format, parseISO } from "date-fns";


export default function UsageScreen(props){    
    const mainstore = MainStore()
    const navigate = useNavigate()        
    const [organizationUsage, setOrganizationUsage] = useState(false)
    const {id} = useParams()
    const [update, forceUpdate] = useReducer(x=>x+1)

    useDataEvent('new_primitive delete_primitive',undefined, forceUpdate)
    
    useEffect(()=>{
        fetch(`/api/organizations`,{
            method: 'get',
            }).then(d=>d.json()).then(org=>{
                setOrganizationUsage( org[0] )
            })
    },[])    

    console.log(organizationUsage)

    const data = useMemo(()=>{
        if( organizationUsage ){

            let start, end, track = {}
            const usage = organizationUsage.usage ?? []
            const dates = usage.map(d=>d.timestamp).filter(Boolean)
            const parsed = dates.map(parseISO).sort((a, b) => a - b)
            
            const fmt = 'yyyy-MM-dd HH:mm'
            
            // bucket counts
            const counts = usage.reduce((acc, d) => {
                const key = format(parseISO(d.timestamp), fmt)
                //acc[key] = (acc[key] || 0) + d.delta
                acc[key] = d.post ?? 0
                return acc
            }, {})
            
            // build full day range
            const from = parsed[0]
            const to   = addMinutes(parsed[parsed.length - 1],1)
            if(from && to ){
                let d = from
                const data = []
                while( d <= to){
                    data.push({
                        name:   format(d, fmt),
                        count: counts[format(d, fmt)] || 0
                    })
                    d = addMinutes(d, 1)
                }
                return data
            }
            return []
        }
    }, [organizationUsage?.usage?.length])




    return (
    <>
        <div className="w-full h-screen overflow-y-scroll p-4">
            <ResponsiveContainer width="100%" height="100%">
               <BarChart
            width={500}
            height={300}
            data={data}
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
    </> 
    )
}