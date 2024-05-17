import { useRef, useState } from "react";
import { ExpandArrow, PrimitiveCard } from "./PrimitiveCard";
import Panel from "./Panel";
import { ChevronDownIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import AIProcessButton from "./AIProcessButton";
import MainStore from "./MainStore";
import useDataEvent from "./CustomHook";
import SmallButton from "./SmallButton";


const processText = (text) => {
    const lines = text.split("\n").filter(d=>d && d.length > 0);
    const elements = [];
    let currentList = [];
    let lineCount = 0

    const ulClass = "ml-6 list-disc space-y-1"
  
    lines.forEach((line, index) => {

        const boldWholeLineMatch = /^\*\*(.+?)\*\*$/.exec(line);
        if (boldWholeLineMatch) {
            line = `<strong style='font-size:20px' class="font-bold">${boldWholeLineMatch[1]}</strong>`;
        } else {
            line = line.replaceAll(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
        }
  
        if (line.startsWith("- ")) {
            currentList.push(<li key={index} dangerouslySetInnerHTML={{ __html: line.substring(2) }} />);
            lineCount++
        } else {
            if (currentList.length > 0) {
                elements.push(<ul class={ulClass} key={`list-${index}`}>{currentList}</ul>);
                currentList = [];
            }
                elements.push(<p key={index} dangerouslySetInnerHTML={{ __html: line }} />);
                lineCount++
            }
    });
  
    if (currentList.length > 0) {
        elements.push(<ul class={ulClass} key={`list-${lines.length}`}>{currentList}</ul>);
    }
  
    return [elements, lineCount > 2];
  };

  const copyToClipboard = async (divRef) => {
    console.log(divRef)
    if (divRef.current) {
      try {
        const htmlContent = divRef.current.innerHTML;
        const plainTextContent = divRef.current.innerText;

        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        const data = [
            new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
          ];

        await navigator.clipboard.write(data);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    }
  };


export default function SummaryCard({primitive, ...props}){
    useDataEvent('relationship_update',primitive.id)
    const [preview, setPreview] = useState(true)
    const [longSummary, setLongSummary] = useState(false)
    const summaryRef = useRef()
    const results = primitive.primitives.uniqueAllItems

    let summary = <></>

    if(primitive.referenceParameters?.summary){
        let [list, isLong] = processText( primitive.referenceParameters?.summary )
        if( isLong != longSummary){
            setLongSummary( isLong)
        }
        
        summary = <div 
            ref={summaryRef} 
            className={`mx-1 my-3 py-2 px-4 rounded-lg bg-gray-50 text-gray-600 text-sm space-y-2 ${longSummary && preview ? "max-h-32 overflow-hidden" : ""}`}>
                {list}
            </div>
    }

    return  <div className="w-full bg-white rounded-md shadow flex flex-col p-2">
                <div className="flex justify-between place-items-center">
                    <PrimitiveCard variant={false} primitive={primitive} compact showEdit disableHover editing className='w-full place-items-center !bg-transparent'/>
                </div>
                <Panel collapsable open={false} className="!mt-0 ml-1" title="Settings" titleClassName='flex w-fit text-xs text-gray-500' arrowClass="text-gray-500 ml-0.5 w-4 h-4">
                    <div className="w-full flex-col text-xs my-2 space-y-1 shrink-0">
                        <PrimitiveCard.Parameters primitive={primitive} editing leftAlign compactList className="text-xs text-slate-500" fullList />
                    </div>
                </Panel>
                    <div className="w-full flex space-x-2 justify-end">
                        {results.length > 0 && <SmallButton icon={ClipboardIcon} action={()=>copyToClipboard(summaryRef)}/>}
                        <AIProcessButton active='rebuild_summary'  primitive={primitive} />
                    </div>
                    {summary}
                    {longSummary && <div className='w-full flex justify-end -mt-1 mb-1'>
                        <div className="bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-200 p-1 text-xs mr-1" onClick={()=>setPreview(!preview)}>{`Show ${preview ? "more" : "less"}`}</div>
                    </div>}
        </div>
}