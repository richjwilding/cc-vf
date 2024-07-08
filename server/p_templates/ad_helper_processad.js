                    async (source, idTracker) => {
                        console.log(`in evaluare`)
                        const out = []
                        const findPrefix = (nodes, match)=>{
                            const out = []
                            for(const d of nodes){
                                const m = d.textContent.match(match)
                                if( m ){
                                    out.push(d)
                                }
                            }
                            return out
                        }
                        
                        console.log(source)
                        if( source ){
                            const header = findPrefix(document.querySelectorAll('[role="heading"]'), /Summary data/i)?.[0]
                            const target = header?.parentElement?.parentElement?.parentElement?.nextSibling
                            console.log( target ? "Found grid in popup" : "Cant find grid in popup")
                            source = target
                        }
                        const iconMap = {
                            'zbKKU7AIEny_-68px -335px': "Facebook", 
                            'Fibg3DD_t0W_-14px -545px': "Instagram", 
                            "RBY2XQNTT-A_-14px -545px": "Instagram",
                            'zbKKU7AIEny_-106px -186px': "Audience network", 
                            'zbKKU7AIEny_-81px -335px' : "Messenger",
                            "-14px -545px": "Instagram"
                        }

                        const findPrefixAndExtract = (nodes, match)=>{
                            const out = []
                            for(const d of nodes){
                                const m = d.textContent.match(match)
                                if( m ){
                                    out.push(m.slice(1))
                                }
                            }
                            return out
                        }

                        if(!(source ?? document).querySelectorAll){
                            console.log(`No qsa`)
                            console.log(source)
                            console.log(document)
                            return
                        }
                        const elements = Array.from((source ?? document).querySelectorAll('[role="button"]'));
                        console.log(`got ${elements.length} candidates`)
                        elements.forEach(element => {
                            if(  element.textContent.trim() === "See ad details"){
                                let id
                                try{

                                    function findNodeWithMultipleChildren(node) {
                                        if (node.children.length > 1) {
                                        return node;
                                        }
                                        for (let child of node.children) {
                                        const result = findNodeWithMultipleChildren(child);
                                        if (result) {
                                            return result;
                                        }
                                        }
                                        return null;
                                    }

                                    const parent = element.parentElement.nextSibling.parentElement
                                    const adSpans = [...parent.querySelectorAll('span')]
                                    const adContent = element.parentElement.nextSibling.nextSibling
                                    const anchors = [...parent.querySelectorAll('a')]
                                    
                                    id = findPrefixAndExtract( adSpans, /^Library ID:\s(\d+)/)?.[0]?.[0]


                                    const runningFrom = findPrefixAndExtract( adSpans, /^Started running on (\d+ \S{3} \d{4})/)?.[0]?.[0]
                                    const range = findPrefixAndExtract( adSpans, /^(\d+ \S{3} \d{4}) - (\d+ \S{3} \d{4})/)?.[0]
                                    const variants = findPrefixAndExtract( adSpans, /^(\d+) ads use this creative and text$/)?.[0]?.[0]
                                    const platformNode = findPrefix( adSpans, /^Platforms$/)?.[0]
                                    const platforms = platformNode && platformNode.nextSibling ? [...platformNode.nextSibling.querySelectorAll('div')].filter(d=>d.style.maskImage).map(d=>[d.style.maskImage.match(/.*\/(.+?)\.png/)?.[1], d.style.maskPosition]).map(d=>iconMap[d.join("_")] ?? iconMap[d[1]] ?? d) : undefined
                                    const active = runningFrom ? true : false
                                    
                                    const sponsor = anchors[0]
                                    const sponsorName = sponsor.textContent
                                    const sponsorLogo = adContent.querySelector(`img[alt="${sponsorName}"]`)?.getAttribute("src")
                                    let sponsorUrl = sponsor.getAttribute('href')
                                    if( sponsorUrl[0] === "/"){
                                        sponsorUrl = "https://www.facebook.com" + sponsorUrl
                                    }

                                    const adDetail = findNodeWithMultipleChildren(adContent)
                                    if( !adDetail ){
                                        console.log(`Couldnt find content for ${id}`)
                                    }
                                    const adHeader = adDetail.children[1].textContent
                                    const images = [...((adDetail.children.length > 2 ? adDetail.children[2] : adDetail.children[1]).querySelectorAll('img'))].map(d=>d.getAttribute('src'))

                                    const buttons = [...adDetail.querySelectorAll('[role="button"]')]
                                    const ctaButton = buttons.length > 1 ? buttons.slice(-1)[0] : undefined
                                    const cta = ctaButton?.textContent
                                    
                                    data = {
                                        id,
                                        platforms,
                                        date_start: runningFrom ? new Date( runningFrom ).toISOString() : (range?.[0] ? new Date( range?.[0] ).toISOString() : undefined),
                                        date_end: range?.[1] ? new Date(range?.[1])?.toISOString() : undefined,
                                        variants,
                                        active,
                                        sponsorName,
                                        sponsorUrl,
                                        sponsorLogo,
                                        images,
                                        adHeader,
                                        cta
                                    }
                                    console.log(`IDTRACKER = ${idTracker === undefined} ${Object.keys(idTracker ?? {}).length} , ${id}`)
                                    if(idTracker && idTracker[id]){
                                        console.log(`Ad already processed - skip`)
                                    }else{
                                        out.push(data)
                                    }
                                }catch(error){
                                    console.log(`Couldnt parse ad ${id}`)
                                    console.log(error.message)
                                }
                            }
                        })
                        return out
                    }