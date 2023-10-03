import { Client } from "@elastic/elasticsearch";

let instance

export default function DocumentSearch(){    
    if( instance ){
        return instance
    }
    instance = {}

    const client = new Client(
        (process.env.NODE_ENV === 'production')
        ?   {
                cloud: {
                id:process.env.ELASTIC_ID,
                },
                auth: {
                apiKey:process.env.ELASTIC_KEY
                }
            }
        :   {
                node:'http://localhost:9200',
            }
    )

    instance.indexDocument = async (id, content, indexId)=>{
        let result
        try{
            result = await client.index({
                index: indexId,
                document:{
                    id:id,
                    content: content
                }
            });
            console.log(result) 
        }catch(error){
            console.log("Error in indexDocument")
            console.log(error)
        }
        return result?.result === "created"
    };

    instance.checkForIndex = async (ids, indexId)=>{

        const out = []
        for( const id of ids){
            console.log(id, indexId,process.env.ELASTIC_KEY)
            if( !(await client.exists({id:id, index:indexId}))){
                out.push(id)
            }
        }
        return out
    }


    // Perform a search
    instance.searchFiles = async (searchTerm, indexId)=>{
        const out = []
        try{
            const result = await client.search({
                index: indexId,
                query: { match_phrase: { content: searchTerm } },
                fields:["id"],
                _source: false

            });
            if(result?.hits){
                return result.hits?.hits.map(d=>d.fields?.id?.[0]).filter(d=>d)
            }
            console.log(searchTerm, result.hits?.hits) 
        }catch(error){
            console.log("Error in indexDocument")
            console.log(error)
        }
        return []
    }
    return instance
}
