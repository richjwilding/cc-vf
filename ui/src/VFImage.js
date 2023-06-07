import { useState } from "react"

export function VFImage({src, ...props}){

    const [count, setCount] = useState() 



    function error(e){
        const nc = count ? count + 1 : 1
        const timeout = (nc ** 2) * 1000
        if( nc < 8){
            console.log(`Retry in ${timeout} for ${src}`)
            setTimeout(()=>{
                setCount(nc)
            },timeout)
        }
    }
    return <img 
                src={count ? `${src}?${count}` : src}
                {...props}
                onError={error}
                />

}