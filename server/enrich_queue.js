import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import Primitive from "./model/Primitive";
import { dispatchControlUpdate, primitiveOrigin, primitiveParentPath, primitiveRelationship } from "./SharedFunctions";
import { enrichCompanyFromLinkedIn } from "./linkedin_helper";
import { findOrganizationsFromCB, pivotFromCrunchbase } from "./crunchbase_helper";
import Category from "./model/Category";
//import { fetchArticlesFromGNews } from "./gnews_helper";
import { fetchPostsFromSocialSeracher } from "./socialsearcher_helper";
import Parser from "@postlight/parser";


let instance

export default function EnrichPrimitive(){    
    if( instance ){
        return instance
    }
    
    instance = new Queue("enrichQueue", {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
    });
    instance.myInit = async ()=>{
        console.log("Enrich Queue")
        const jobCount = await instance.count();
        console.log( jobCount + " jobs in queue (enrich)")
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue  (enrich)")
    }

    instance.findArticles = (primitive, options )=>{
        if( primitive.type === "activity"){
            const field = `processing.articles`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Finding articles"})
            instance.add(`search_articles_${primitive.id}` , {id: primitive.id, mode: "find_articles", options: options, field: field})
        }
    }
    instance.siteDiscovery = (primitive, options )=>{
        if( primitive.type === "entity"){
            const field = `processing.site`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Examining url"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "site_discovery", options: options, field: field})
        }
    }
    instance.findPosts = (primitive, options )=>{
        if( primitive.type === "activity"){
            const field = `processing.posts`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Finding posts"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "find_posts", options: options, field: field})
        }
    }
    instance.searchCompanies = (primitive, options )=>{
        if( primitive.type === "activity"){
            const field = `processing.expanding.0`
            dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date()})
            instance.add(`search_topcics_${primitive.id}` , {id: primitive.id, target: "entity", mode: "search_company", options: options})
        }
    }
    instance.enrichCompany = (primitive, source, force)=>{
        if( primitive.type === "entity"){
            dispatchControlUpdate(primitive.id, "processing.enrich", {state: "active", started: new Date(), targetFields: ['title', 'referenceParameters.url', 'referenceParameters.description', 'referenceParameters.industry']})
            instance.add(`enrich_${primitive.id}_from_${source}` , {id: primitive.id, source: source, target: "entity", mode: "enrich", force: force})
        }
    }
    instance.pivotCompany = async (primitive, source, action)=>{
        if( primitive.type === "entity" || primitive.type === "activity"){
            
            const parentId = primitive.type === "entity" ?  primitiveOrigin(primitive) : primitive.id
            let resultSet
            if( primitive.type === "entity"){
                resultSet = primitiveParentPath(primitive, "result", parentId, true)?.[0]
            }else{
                const category = await Category.findOne({id: primitive.referenceId})
                if( category ){
                    resultSet = category.resultCategories && category.resultCategories.find((d)=>d.resultCategoryId === action.referenceId)?.id
                }
            }

            if( resultSet !== undefined){
                const field = `processing.expanding.${resultSet}`
                console.log(parentId)
                console.log(resultSet)
                if( parentId ){
                    dispatchControlUpdate(parentId, field, {status: "pending", node: primitive.id})
                }
                dispatchControlUpdate(primitive.id, "processing.pivot" , {status: "pending"}, {track: primitive.id, text:"Finding similar companies"})
                instance.add(`pivot_${primitive.id}_from_${source}` , {id: primitive.id, action: action, source: source, target: "entity", mode: "pivot", parentId: parentId, field: field})
            }
        }
    }
    
    
    new Worker('enrichQueue', async job => {
        const primitive = await Primitive.findOne({_id: job.data.id})
        if( primitive){
            if( job.data.mode === "site_discovery" ){
                const url = primitive.referenceParameters?.url
                console.log(`site_discovery ${primitive.id} ${url}`)

                if( url ){
                    console.log(`FETCHING`)
                    const result = await Parser.parse(url, {
                        contentType: 'markdown',
                      })

                    console.log(result)
                    if( result ){
                        dispatchControlUpdate(primitive.id, `referenceParameters.excerpt`, result.excerpt)
                     //   dispatchControlUpdate(primitive.id, `referenceParameters.content`, result.content)
                    }
                    console.log(`back`)
                }

                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "find_articles" ){
                console.log(`find_articles ${primitive.id} ${primitive.referenceParameters?.topics}`)
                throw "DEPRECATED!!"
  //              await fetchArticlesFromGNews( primitive, job.data.options )
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "find_posts" ){
                console.log(`find_posts ${primitive.id} ${primitive.referenceParameters?.topics}`)
                await fetchPostsFromSocialSeracher( primitive, job.data.options )
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "search_company" ){
                console.log(`search_company ${primitive.id} ${primitive.referenceParameters?.topics}`)
                await findOrganizationsFromCB( primitive, job.data.options )
                dispatchControlUpdate(primitive.id, `processing.expanding.0`, null)
            }
            if( job.data.mode === "enrich" ){
                console.log(`Processing enrichment for ${primitive.id}`)
                if( job.data.target === "entity" ){
                    if( job.data.source === "linkedin" ){
                        const result = await enrichCompanyFromLinkedIn( primitive, job.data.force)
                        SIO.notifyPrimitiveEvent( primitive, result)
                    }
                }
                dispatchControlUpdate(primitive.id, "processing.enrich", null)
            }
            if( job.data.mode === "pivot" ){
                try{
                    console.log(`Processing pviot for ${primitive.id}`)
                    if( job.data.target === "entity" ){
                        if( job.data.source === "crunchbase" ){
                            const newPrims = await pivotFromCrunchbase(primitive, job.data.action)
                        }
                    }
                }catch(error){
                    console.log(`Error in enrichQueue.pivot `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, "processing.pivot" , null, {track: primitive.id})
                if( job.data.parentId ){
                    dispatchControlUpdate(job.data.parentId, job.data.field, null)
                }
            }
        }
        
    },
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
}
