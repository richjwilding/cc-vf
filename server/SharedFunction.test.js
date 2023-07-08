import * as dotenv from 'dotenv' 
import mongoose, { mongo } from 'mongoose';
import { addRelationship, removeRelationship, createPrimitive, primitiveParents, primitivePrimitives, primitiveChildren, removePrimitiveById, primitiveDescendents } from "./SharedFunctions";
import Primitive from './model/Primitive';
import Workspace from './model/Workspace';
var ObjectId = require('mongoose').Types.ObjectId;


dotenv.config()
let firstWorkspace 
beforeAll(async ()=>{
    mongoose.set('strictQuery', false);
    mongoose.connect(process.env.MONGOOSE_TEST_URL)

    firstWorkspace = await Workspace.findOne({})
})


describe("Connection", () => {
    test('Create primitive with invalid type should fail', async () => {
        await expect(createPrimitive({data:{type:"INVALID"}})).rejects.toThrow(/not recognized/);
    });
    test('Create primitive without workspace should fail', async () => {
        await expect(createPrimitive({data:{type:"activity"}})).rejects.toThrow(/Cant create without a workspace/);
    });
    test('Create primitive defaults to empty path', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"activity"
                },
                workspaceId: firstWorkspace.id
            }) 
        
        expect( newPrim ).toBeDefined(undefined)
        expect( newPrim.plainId ).toBeDefined()
        expect( newPrim.primitives ).toEqual( {} )
        expect( newPrim.parentPrimitives ).toBeUndefined(  )

        await Primitive.deleteOne({_id: newPrim._id})
    })
    test('Create assessment fails unless it has a Venture parent', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"activity"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
    
        await expect(child).rejects.toThrow(/with parent of type/)

        await Primitive.deleteOne({_id: newPrim._id})
    })
    test('Create assessment passes if it has a Venture parent', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
        expect( newPrim ).toBeDefined(undefined)
        expect( child ).toBeDefined(undefined)
    

        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
    })
    test('Creating child primitive should setup links to parent, and from parent to child', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
        expect( newPrim ).toBeDefined(undefined)
        expect( child ).toBeDefined(undefined)

        expect( newPrim.primitives ).toEqual({})

        const vParent = await Primitive.findOne({_id: newPrim._id})
        expect( vParent.primitives ).toEqual({"origin": [child._id.toString()]})

        const vChild = await Primitive.findOne({_id: child._id})
        expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.origin"]})

        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
    })
    test('Removing relationship from between primitives should update links on both parent and child ', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 

        await addRelationship(newPrim._id.toString(), child._id.toString(), "test")
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
        
            expect( vParent.primitives ).toEqual({"origin": [child._id.toString()], "test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.origin","primitives.test"]})
        }

        await removeRelationship(newPrim._id.toString(), child._id.toString(), "origin")
        
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
        
            expect( vParent.primitives ).toEqual({"test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.test"]})
        }

        await removeRelationship(newPrim._id.toString(), child._id.toString(), "test")

        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
        
            expect( vParent.primitives ).toEqual({})
            expect( vChild.parentPrimitives ).toEqual({})
        }

        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
    })
    test('Removing a relationship between primitives should not impact other relationships', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 

        await addRelationship(newPrim._id.toString(), child._id.toString(), "test")
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
        
            expect( vParent.primitives ).toEqual({"origin": [child._id.toString()], "test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.origin","primitives.test"]})
        }

        await removeRelationship(newPrim._id.toString(), child._id.toString(), "origin")
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
        
            expect( vParent.primitives ).toEqual({"test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.test"]})
        }


        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
    })
    test('Adding / removing a relationship between primitives should not impact relationships with other primitives', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
        const child2 = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 

        await addRelationship(newPrim._id.toString(), child._id.toString(), "test")
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
            const vChild2 = await Primitive.findOne({_id: child2._id})
        
            expect( vParent.primitives ).toEqual({"origin": [child._id.toString(), child2._id.toString()], "test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.origin","primitives.test"]})
            expect( vChild2.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.origin"]})
        }

        await removeRelationship(newPrim._id.toString(), child._id.toString(), "origin")
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
            const vChild2 = await Primitive.findOne({_id: child2._id})
        
            expect( vParent.primitives ).toEqual({"origin": [child2._id.toString()], "test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.test"]})
            expect( vChild2.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.origin"]})
        }
        await removeRelationship(newPrim._id.toString(), child2._id.toString(), "origin")
        {
            const vParent = await Primitive.findOne({_id: newPrim._id})
            const vChild = await Primitive.findOne({_id: child._id})
            const vChild2 = await Primitive.findOne({_id: child2._id})
        
            expect( vParent.primitives ).toEqual({"test": [child._id.toString()]})
            expect( vChild.parentPrimitives ).toEqual({[newPrim._id.toString()]: ["primitives.test"]})
            expect( vChild2.parentPrimitives ).toEqual({})
        }


        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
        await Primitive.deleteOne({_id: child2._id})
    })
    test('Removing a primitve should mark it deleted and prevent lookups via the Shared Function utilities', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
        const child2 = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 

        {
            const children = await primitiveChildren( newPrim )
            expect( children ).toBeDefined()
            expect( children.length ).toEqual(2)
            expect( children.map((d)=>d._id.toString()) ).toEqual([child._id.toString(), child2._id.toString()])
        }


        expect( (await Primitive.findOne({_id: child._id})).deleted ).toBeUndefined()
        await removePrimitiveById( child._id.toString() )
        expect( (await Primitive.findOne({_id: child._id})).deleted ).toEqual(true)

        {
            const children = await primitiveChildren( newPrim )
            expect( children ).toBeDefined()
            expect( children.length ).toEqual(1)
            expect( children.map((d)=>d._id.toString()) ).toEqual([child2._id.toString()])
        }
        

        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
        await Primitive.deleteOne({_id: child2._id})
    })

    const addPrimitives = async(count = 1, type = "activity", parent)=>{
        const out = []
        for( let idx = 0; idx < count; idx++){
            out.push( await createPrimitive({data:{type:type}, parent: parent ? parent._id.toString() : undefined, workspaceId: firstWorkspace.id}) )
        }
        return out
    }

    const buildNested = async ()=>{
        const root =  await addPrimitives()
        const layer1 = await addPrimitives(3, "result", root[0])
        const layer2a = await addPrimitives(4, "result", layer1[0])
        const layer2b = await addPrimitives(5, "question", layer1[1])
        const layer3a = await addPrimitives(4, "question", layer2a[1])
        const layer4 = await addPrimitives(4, "question", layer3a[1])
        return [root, layer1, layer2a, layer2b, layer3a, layer4].flat().map((d)=>d._id.toString())
    }

    test('Descendants test 1', async () => {
        const target = await Primitive.findOne({_id: new ObjectId("647f259f6147d16fc5b3b837")})
        const list = await primitiveDescendents(target)
        expect(list.length).toEqual(10014)

        const list2 = await primitiveDescendents(target, undefined, {paths: []})
        expect(list2.length).toEqual(10014)
    })

    test('Descendants should traverse multiple layers', async () => {
        const set = await buildNested()

        expect(set.length).toEqual(21)
        
        const root = await Primitive.findOne({_id: set[0]})
        const list = await primitiveDescendents(root)
        expect(list.length).toEqual(20)

        for(const d of set){
            await Primitive.deleteOne({_id: d._id})
        }
    })
    test('Descendants should stop at nodes if they match a defined type', async () => {
        const set = await buildNested()

        expect(set.length).toEqual(21)
        
        const root = await Primitive.findOne({_id: set[0]})

        const list2 = await primitiveDescendents(root, "result")
        expect(list2.length).toEqual(3)

        const list3 = await primitiveDescendents(root, "question")
        expect(list3.length).toEqual(9)

        for(const d of set){
            await Primitive.deleteOne({_id: d._id})
        }
    })

    test('Removing a primtiive should trigger deletion of origin descendants, and return a list of deleted ids', async () => {
        const newPrim = await createPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: firstWorkspace.id
            }) 

        const child = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
        const child2 = await createPrimitive({
                data:{
                    type:"assessment"
                },
                parent: newPrim._id.toString(),
                workspaceId: firstWorkspace.id
            }) 
        const child3 = await createPrimitive({
                data:{
                    type:"question"
                },
                parent: child._id.toString(),
                workspaceId: firstWorkspace.id
            }) 

        {
            const root = await Primitive.findOne({_id: newPrim._id})
            const children = await primitiveChildren( root )
            expect( children ).toBeDefined()
            expect( children.length ).toEqual(2)
            expect( children.map((d)=>d._id.toString()) ).toEqual([child._id.toString(), child2._id.toString()])

            const descendants = await primitiveDescendents( root )
            expect( descendants ).toBeDefined()
            expect( descendants.length ).toEqual(3)
            expect( descendants.map((d)=>d._id.toString()).sort() ).toEqual([child._id.toString(), child2._id.toString(), child3._id.toString()].sort())
        }

        const removedIds = await removePrimitiveById( child._id.toString() )
        expect( removedIds ).toBeDefined()
        expect( removedIds.length ).toEqual(2)
        {
            const root = await Primitive.findOne({_id: newPrim._id})
            const descendants = await primitiveDescendents( root )
            expect( descendants ).toBeDefined()
            expect( descendants.length ).toEqual(1)
            expect( descendants.map((d)=>d._id.toString()) ).toEqual([child2._id.toString()])

            const deleted1 = await Primitive.findOne({_id: child._id})
            const deleted2 = await Primitive.findOne({_id: child3._id})
            expect( deleted1.deleted ).toEqual(true)
            expect( deleted2.deleted ).toEqual(true)
        }

        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
        await Primitive.deleteOne({_id: child2._id})
        await Primitive.deleteOne({_id: child3._id})
    })
    test('Descendants deletion test', async () => {
        const fan = 5
        const root =  (await addPrimitives())[0]
        const layer1 = await addPrimitives(fan, "result", root)
        for(let idx = 0;idx < fan; idx++){
            const layer2 = await addPrimitives(fan, "evidence", layer1[idx])
            for(let idx = 0;idx < fan; idx++){
                const layer3 = await addPrimitives(fan, "evidence", layer2[idx])
            }
        }
        const total = (fan * fan * fan) + (fan * fan) + fan
        const sub = 1 + (fan * fan) + fan

        const vRoot = await Primitive.findOne({_id: root._id})
        const set = await primitiveDescendents(vRoot)
        expect( set.length ).toEqual( total )

        const deleted1 = await removePrimitiveById( layer1[1]._id.toString() )
        expect( deleted1.length ).toEqual(sub)

        for(const test of set){
            const refresh = await Primitive.findOne({_id: test._id})
            if(deleted1.includes(test._id.toString())){
                expect(refresh.deleted).toEqual(true)
            }else{
                expect(refresh.deleted).toBeUndefined()
            }
        }

        const deleted2 = await removePrimitiveById( vRoot._id.toString() )
        expect( deleted2.length ).toEqual( total - sub + 1)

        for(const test of set){
            const refresh = await Primitive.findOne({_id: test._id})
            expect(refresh.deleted).toEqual(true)
        }


        for(const d of set){
            await Primitive.deleteOne({_id: d._id})
        }
    })
    test('Delete should only cascade through origin and auto relationship - pt 1', async () => {
        const set = await buildNested()
        const set2 = await buildNested()

        expect(set.length).toEqual(21)
        expect(set2.length).toEqual(21)
        
        const root = await Primitive.findOne({_id: set[0]})
        const list = await primitiveDescendents(root)
        expect(list.length).toEqual(20)

        const root2 = await Primitive.findOne({_id: set2[0]})
        const leaf = list[list.length - 1]
        addRelationship(leaf._id.toString(), root2._id.toString(), "test")

        const _root = await Primitive.findOne({_id: set[0]})
        const _list = await primitiveDescendents(_root, undefined, {paths: []})
        expect(_list.length).toEqual(41)

        const removedIds = await removePrimitiveById(root._id.toString())
        expect(removedIds.length).toEqual(21)

        for(const test of set){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toEqual(true)
        }
        for(const test of set2){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toBeUndefined()
        }

        for(const d of set){
            await Primitive.deleteOne({_id: d})
        }
        for(const d of set2){
            await Primitive.deleteOne({_id: d})
        }
    })
    test('Delete should only cascade through origin and auto relationship - pt 2', async () => {
        const set = await buildNested()
        const set2 = await buildNested()

        expect(set.length).toEqual(21)
        expect(set2.length).toEqual(21)
        
        const root = await Primitive.findOne({_id: set[0]})
        const list = await primitiveDescendents(root)
        expect(list.length).toEqual(20)

        const root2 = await Primitive.findOne({_id: set2[0]})
        const leaf = list[list.length - 1]
        addRelationship(leaf._id.toString(), root2._id.toString(), "auto")

        const _root = await Primitive.findOne({_id: set[0]})
        const _list = await primitiveDescendents(_root, undefined, {paths: []})
        expect(_list.length).toEqual(41)

        const removedIds = await removePrimitiveById(root._id.toString())
        expect(removedIds.length).toEqual(42)

        for(const test of set){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toEqual(true)
        }
        for(const test of set2){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toEqual(true)
        }

        for(const d of set){
            await Primitive.deleteOne({_id: d})
        }
        for(const d of set2){
            await Primitive.deleteOne({_id: d})
        }
    })
})
afterAll(async ()=>{
    await mongoose.disconnect()
})
