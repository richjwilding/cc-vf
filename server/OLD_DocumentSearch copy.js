import FlexSearch from "@akryum/flexsearch-es";
import DocumentIndex from "./model/DcoumentIndex";

const uri = 'your-mongodb-uri';
const indexCollectionName = 'index';

// Create a FlexSearch index
const index = new FlexSearch();

// Index a document
export async function indexDocument(id, content, indexId){
    const doUpdate = async (count = 3)=>{
        const expectedVersion = await loadIndex(indexId)
        index.add(id, content);

        
        try{
            const data = {}
            let idx = 0

            await new Promise(res => 
                index.export(function(k,v){
                    return new Promise(function(resolve){
                        data[k]=v
                        idx++
                        if( idx === 4)
                        {
                            res()
                            return
                        }
                        resolve();
                    });

                })
            )

            const result = await DocumentIndex.updateOne(
                { foreignId: indexId, version: expectedVersion },
                { $set: { index: data  }, $inc: { version: 1 } })

                if (result.modifiedCount === 1) {
                    console.log('Document updated successfully.');
                } else {
                    console.log('Document version mismatch. Update failed.');
                    count--
                    if(count > 0){
                        return await doUpdate(count)
                    }
                }
            }catch(error){
                console.log(`Error updating docuemnt index`)
                console.log(error)
            }
    }
    await doUpdate()
};

export async function checkForIndex(ids, indexId){
    await loadIndex( indexId )
    console.log(`.....`)
    ids = [ids].flat()
    return ids.filter(id=>!index.contain(id))
}

// Load the index from MongoDB
const loadIndex = async (indexId, create = true) => {
  const indexData = await DocumentIndex.findOne({ foreignId: indexId });
  if (indexData ) {
    if( indexData.index ){
        for(const key of Object.keys(indexData.index)){
            index.import(key, indexData.index[key]);
        }
    }
  } else {
    console.log('Index not found.');
    if(create ){
        console.log(`creating`)
        await DocumentIndex.create({ foreignId: indexId, version: 0 });
        return await loadIndex( indexId, false)
    }
}
  return indexData?.version
};

// Perform a search
export async function searchFiles(searchTerm, indexId){
    await loadIndex()
  const result = index.search(searchTerm);
  return result;
};

