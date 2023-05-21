import { ChevronRightIcon, CheckIcon } from "@heroicons/react/24/outline"
import useDataEvent from "./CustomHook"
import { motion, AnimatePresence } from "framer-motion"
const Progress = ({primitive,...props})=>{
    const framework = props.framework || primitive.framework
    const lensId = props.lensId || 0
    const lens = framework.lenses[lensId]
    const scores = props.scores || primitive.analyzer().scoreByLens(lensId)
    const includeTitle = props.includeTitle === undefined || props.includeTitle
    const atTarget = scores.targets.map((d)=>d.score).includes(scores.score)
    const target = scores.targets.filter((d)=>d.score >= scores.score).shift()?.score 

    const bar = (
        <>
            <div className={`w-full rounded-r-full bg-${lens.base}-200 absolute my-2 h-5`}/>
            <div className="mr-2 relative">
            <motion.div layout style={{width: `${scores.score / scores.max * 100}%`}} className={` bg-${lens.base}-600 absolute my-2 mr-2 h-5`}/>            
            {
                scores.targets.map((d)=>{
                    const isTarget = d.score === target
                    const done = scores.score >= d.score
                    const size = isTarget ? "1.25rem" :  "0.5rem"
                    const margin = isTarget ? "0.5rem" :  "0.85rem"
                    return (<div key={d.score} style={{left: `${d.score / scores.max * 100}%`, width: size, height:size, marginTop: margin}} className={` -translate-x-1/2 absolute rounded-full bg-${lens.base}-${done ? "100" : "50"} ${isTarget ? `border-4 border-${lens.base}-600` : ""}`}/>)
                })
            }
            <motion.div layout style={{left: `calc(${scores.score / scores.max * 100}% - ${atTarget ? "16px" : "10px"})`}} className={`mt-${atTarget ? "0.5" : "2"} absolute rounded-full bg-${lens.base}-${atTarget ? "100" : "600"} border-4 border-${lens.base}-600`}>
                {atTarget && <CheckIcon  strokeWidth='2.5' className={`text-${lens.base}-600 p-0.5 w-6  h-6`}/>}
                {!atTarget && <ChevronRightIcon strokeWidth='2.5' className={`text-white w-3  h-3`}/>}
            </motion.div>
            </div>
        </>)

    return (
        <div className={`w-full relative h-[2.25em] my-2`}>
            {includeTitle && <div className={`flex relative text-white text-sm font-semibold w-full`}>
                <p className={`w-48 bg-${lens.base}-600 my-2 ml-2 -mr-2 pl-2`}>{lens.title}</p>
                <div className='relative w-full'>{bar}</div>
            </div>}
            {!includeTitle && bar}
        </div>
    )
}

export function AssessmentCard({primitive,...props}) {
    useDataEvent("set_parameter", primitive?.id)
    if( primitive === undefined){
        return <></>
    }
    const framework = primitive.framework
    const scores = primitive.analyzer().scoreByLens()
    return (framework.lenses.map((lens, idx)=>(
        <Progress key={`lens${idx}`} scores={scores[idx]} lensId={idx} framework={framework}/>
    )))
}
AssessmentCard.Progress = Progress