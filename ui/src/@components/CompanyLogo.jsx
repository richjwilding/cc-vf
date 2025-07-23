import { useState, useEffect } from 'react'
import { Vibrant } from "node-vibrant/browser";

export function useCompanyLogo({company, domain, url: pUrl}) {
    const url = pUrl ? `/api/remoteImage?url=${encodeURIComponent(pUrl)}` : company ? `/api/companyLogo?name=${encodeURIComponent(company)}` : `/api/remoteImage?url=${encodeURIComponent(`https://img.logo.dev/${domain}`)}`
  const alt = `${company} logo`
  const [color, setColor] = useState()
  const [palette, setPalette] = useState([])


  useEffect(() => {
    let isMounted = false
    if( company ){
        isMounted = true
        
        // 2) Kick off palette extraction when `company` changes
        Vibrant
        .from(url)
        .quality(1)            // scan fewer pixels → faster
        .maxColorCount(32)     // smaller palette → faster
        .getPalette()
        .then(palette => {
            if (!isMounted) return
            const hex = palette.Vibrant && palette.Vibrant.hex
            setPalette(Object.entries(palette ?? {}).map(d=>({name:d[0],color:d[1].hex})))
            if (hex){
                setColor(hex)
            }
            })
        .catch(err => {
            console.error('Vibrant error:', err, err.message)
        })
        
    }
    return () => { isMounted = false }
  }, [company])


   const logo = url ? { src: url, alt } : undefined

  return { logo, color, palette }
}