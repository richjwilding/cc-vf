import Primitive from './model/Primitive';
import Counter from './model/Counter';
import PrimitiveConfig from "./PrimitiveConfig";
var ObjectId = require('mongoose').Types.ObjectId;

async function getNextSequenceValue(sequenceName) {
    try {
        // Find the counter document with the specified sequence name
        const counter = await Counter.findOneAndUpdate(
          { name: sequenceName },
          { $inc: { sequence_value: 1 }},
          { new: true, upsert: true }
        );
        
        // Return the updated sequence value
        return counter.sequence_value;
      } catch (error) {
        throw error
      }
}

async function createPrimitive( data ){
    try{
        
        const type = data.data.type
        if( !PrimitiveConfig.types.includes( type )) {
            throw new Error(`Type '${type} not recognized`)
        }
        const config = PrimitiveConfig.typeConfig[type]
        
        if( config ){
            if( config.needParent && data.parent === undefined){
                throw new Error(`Cant create '${type}' without a parent`)
            }
        }
        
        const paths = data.paths.map((p)=>flattenPath( p ))
        if( data.parent ){
            data.data.parentPrimitives = {[data.parent]: paths}
        }
        data.data.plainId = await getNextSequenceValue("base")
        
        let newPrimitive = await Primitive.create(data.data)
        const newId = newPrimitive._id.toString()

        for( const path of paths){
            console.log(path)
            await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(data.parent),
                }, 
                {
                    $push: { [path]: newId }
                })
        }
        return newPrimitive
    }catch(err){
        throw err
    }
    return undefined
}

const flattenPath = (path)=>{
    let out = ['primitives']
    const nest = (node)=>{
        if( node instanceof Object ){
            const k = Object.keys(node)[0]
            out.push(k)
            nest( node[k] )
            return out
        }
        out.push(node === undefined ? "null" : node)
        return out
    }
    return nest( path).join(".")
}
module.exports = {
    createPrimitive: createPrimitive,
    flattenPath: flattenPath
}