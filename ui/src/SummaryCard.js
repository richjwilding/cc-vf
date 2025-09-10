import { useRef, useState } from "react";
import { ExpandArrow, PrimitiveCard } from "./PrimitiveCard";
import Panel from "./Panel";
import { ChevronDownIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import AIProcessButton from "./AIProcessButton";
import MainStore from "./MainStore";
import useDataEvent from "./CustomHook";
import SmallButton from "./SmallButton";
import MarkdownEditor from "./MarkdownEditor";
import { flattenStructuredResponse } from "./PrimitiveConfig";
import { modiftyEntries } from "./SharedTransforms";
import clsx from "clsx";



  const processText = (text) => {
    const lines = text.split("\n").filter(d => d && d.length > 0);
    const elements = [];
    const ulClass = "ml-6 list-disc space-y-1";
    let lineCount = 0;

    const createNestedList = (lines, level = 0) => {
        const result = [];
        while (lines.length > 0) {
            const line = lines[0];
            const indentLevel = (line.match(/^-+/) || [""])[0].length;
            const content = line.substring(indentLevel).trim();

            if (indentLevel < level) {
                break;
            }

            lines.shift();

            const boldWholeLineMatch = /^\*\*(.+?)\*\*$/.exec(content);
            let formattedLine;
            if (boldWholeLineMatch) {
                formattedLine = `<strong style='font-size:20px' class="font-bold">${boldWholeLineMatch[1]}</strong>`;
            } else {
                formattedLine = content.replaceAll(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
            }

            if (indentLevel === level) {
                result.push(<li key={lineCount++} dangerouslySetInnerHTML={{ __html: formattedLine }} />);
            } else if (indentLevel > level) {
                lines.unshift(line); // Push the line back to process in the next recursion
                result.push(<ul class={ulClass} key={`list-${lineCount}`}>{createNestedList(lines, indentLevel)}</ul>);
            }
        }
        return result;
    };

    while (lines.length > 0) {
        const line = lines[0];
        const indentLevel = (line.match(/^-+/) || [""])[0].length;
        const content = line.substring(indentLevel).trim();

        const boldWholeLineMatch = /^\*\*(.+?)\*\*$/.exec(content);
        let formattedLine;
        if (boldWholeLineMatch) {
            formattedLine = `<strong style='font-size:20px' class="font-bold">${boldWholeLineMatch[1]}</strong>`;
        } else {
            formattedLine = content.replaceAll(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
        }

        if (indentLevel === 0) {
            lines.shift();
            if (lines.length > 0 && lines[0].startsWith("-")) {
                const nestedList = createNestedList(lines);
                elements.push(<p key={lineCount++} dangerouslySetInnerHTML={{ __html: formattedLine }} />);
                elements.push(<ul class={ulClass} key={`list-${lineCount}`}>{nestedList}</ul>);
            } else {
                elements.push(<p key={lineCount++} dangerouslySetInnerHTML={{ __html: formattedLine }} />);
            }
        } else {
            elements.push(<ul class={ulClass} key={`list-${lineCount}`}>{createNestedList(lines, indentLevel)}</ul>);
        }
    }

    return [elements, lineCount > 2];
};

  const copyToClipboardOLD = async (divRef) => {
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
        //summary = <MarkdownEditor ref={summaryRef} initialMarkdown={primitive.referenceParameters?.summary }/>

        if( primitive.referenceParameters?.structured_summary ){
            const data = primitive.referenceParameters.structured_summary.slice()
            modiftyEntries( data, "content", entry=>{
                let content = entry.content
                entry._content = content
                if( entry.ids.length > 0){
                    content = content += ` [[id:${entry.ids.join(", ")}]]`
                }
                return content
            } )
            const out = flattenStructuredResponse( data, data)
            modiftyEntries( data, "content", entry=>{
                const c = entry._content
                delete entry["_content"]
                return c
            })

            summary = <MarkdownEditor ref={summaryRef} initialMarkdown={out}/>
        }else{

            let plainSummary = primitive.referenceParameters?.summary
            const sources = primitive.getResultSources
            if(sources.length > 0){
                plainSummary += ` [[id:${sources.join(", ")}]]`
            }else{
                const refs = primitive.primitives.ref.allIds
                if(refs.length > 0){
                    plainSummary += ` [[id:${refs.join(", ")}]]`
                }
            }
            summary = <MarkdownEditor ref={summaryRef} initialMarkdown={plainSummary }/>
        }
    }

    return  <div className={clsx(["w-full bg-white flex flex-col p-2", props.className])}>
                {props.title !== false && <div className="flex justify-between place-items-center">
                    <PrimitiveCard variant={false} primitive={primitive} compact showEdit disableHover editing className='w-full !bg-transparent'/>
                </div>}
                {props.showSetting && <Panel collapsable open={false} className="!mt-0 ml-1" title="Settings" titleClassName='flex w-fit text-xs text-gray-500' arrowClass="text-gray-500 ml-0.5 w-4 h-4">
                    <div className="w-full flex-col text-xs my-2 space-y-1 shrink-0">
                        <PrimitiveCard.Parameters primitive={primitive} hidden='summary' editing leftAlign compactList className="text-xs text-slate-500" fullList />
                    </div>
                </Panel>}
                    <div className="w-full flex space-x-2 justify-end">
                        {results.length > 0 && <SmallButton icon={ClipboardIcon} action={()=>summaryRef.current.copyToClipboard()}/>}
                        <AIProcessButton active='rebuild_summary'  primitive={primitive} />
                    </div>
                    {summary}
                    {longSummary && <div className='w-full flex justify-end -mt-1 mb-1'>
                        <div className="bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-200 p-1 text-xs mr-1" onClick={()=>setPreview(!preview)}>{`Show ${preview ? "more" : "less"}`}</div>
                    </div>}
        </div>
}