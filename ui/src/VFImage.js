import { PhotoIcon } from "@heroicons/react/24/solid"
import { useState } from "react"

export function VFImage({src, ...props}){

    const [count, setCount] = useState() 
    const [loaded, setLoaded] = useState(false) 



    function error(e){
        const nc = count ? count + 1 : 1
        const timeout = (nc ** 2) * 1000
        if( nc < 8){
            setTimeout(()=>{
                setCount(nc)
            },timeout)
        }
    }
    return <>
            <img 
                draggable="false" 
                src={count ? `${src}?${count}` : src}
                {...props}
                className={props.className + (loaded ? '' : ' invisible max-w-[0] !mr-0')}
                onLoad={()=>setLoaded(true)}
                onError={error}
                />
            {!loaded && <PhotoIcon {...props} className={(props.className || "") + " text-gray-400"}/>}
            
            </>

}