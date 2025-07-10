import { useState, useEffect } from 'react'
import { Vibrant } from "node-vibrant/browser";

export function useCompanyLogo(company) {
    const url = `/api/companyLogo?name=${encodeURIComponent(company)}`
  const alt = `${company} logo`
  const [color, setColor] = useState()
  const [palette, setPalette] = useState([])


  useEffect(() => {
    let isMounted = false
    if( company ){
        isMounted = true
        const url = `/api/companyLogo?name=${encodeURIComponent(company)}`
        
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

  if( !company ){
    return {logo: undefined, color: undefined, palette: []}
  }

   const logo = { src: url, alt }

  return { logo, color, palette }
}