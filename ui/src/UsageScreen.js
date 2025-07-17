import { useMemo, useReducer, useState } from "react"
import MainStore from "./MainStore"
import { useNavigate, useParams } from 'react-router-dom';
import useDataEvent from "./CustomHook"
import { BarChart, Bar, Rectangle, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { eachDayOfInterval, format, parseISO } from "date-fns";


export default function UsageScreen(props){    
    const mainstore = MainStore()
    const navigate = useNavigate()        
    const [showNew, setShowNew] = useState(false)
    const {id} = useParams()
    const [update, forceUpdate] = useReducer(x=>x+1)

    useDataEvent('new_primitive delete_primitive',undefined, forceUpdate)
    
    const {workflows, instances} = useMemo(()=>{
        const workflows = MainStore().primitives().filter((p)=>p.type==="flow" && !p.inFlow)
        const instances = workflows.flatMap(d=>d.primitives.origin.allFlowinstance)
        return {workflows, instances}
    },[update])    

    const data = useMemo(()=>{
        let start, end, track = {}
        const dates = instances.map(d=>d.processing?.flow?.started).filter(Boolean)
        // parse and sort
        const parsed = dates.map(parseISO).sort((a, b) => a - b)

        // bucket counts
        const counts = parsed.reduce((acc, d) => {
            const key = format(d, 'yyyy-MM-dd')
            acc[key] = (acc[key] || 0) + 1
            return acc
        }, {})

        // build full day range
        const from = parsed[0]
        const to   = parsed[parsed.length - 1]
        if(from && to ){
            const allDays = eachDayOfInterval({ start: from, end: to })
            
            const data = allDays.map(d => ({
                name:   format(d, 'yyyy-MM-dd'),
                count: counts[format(d, 'yyyy-MM-dd')] || 0
            }))
            return data
        }
        return []

    }, [instances.map(d=>d.id)])




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