import useDataEvent from "./CustomHook";
import MainStore from "./MainStore";
import clsx from "clsx";
import AgentChat from "./AgentChat";
import { useState } from "react";
import { Logo } from "./logo";

export default function AnalysisPage({primitive, ...props}){

    const [agentStatus, setAgentStatus] = useState({activeChat: false})
    useDataEvent('relationship_update',primitive.id)


    return  <div className={clsx([
                "flex flex-col h-[calc(100vh_-_70px)] pb-8 bg-white",
                agentStatus.hasReplies ? "justify-stretch" : "justify-center "
            ])}>
                <div key='chatbar' className={clsx([
                    'flex flex-col left-4 overflow-hidden p-3 place-items-start text-md',
                    'w-[80vw] max-w-6xl mx-auto ',
                    agentStatus.hasReplies ? "h-full " : ""
                ])}>
                    {!agentStatus.hasReplies && <div className="w-full flex justify-center space-x-2 place-items-center">
                        <Logo className='w-20'/><p className="font-['Poppins'] font-black font-family-[Poppins] text-7xl">SENSE</p>
                    </div>}
                    <AgentChat setStatus={setAgentStatus} primitive={primitive} seperateInput={true}/>
                </div>
    </div>
}