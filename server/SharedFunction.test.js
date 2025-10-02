import * as dotenv from 'dotenv' 
import mongoose, { mongo } from 'mongoose';
import { addRelationship, removeRelationship, createPrimitive, primitiveParents, primitivePrimitives, primitiveChildren, removePrimitiveById, primitiveDescendents, fetchPrimitive } from "./SharedFunctions";
import Primitive from './model/Primitive';
import Workspace from './model/Workspace';
var ObjectId = require('mongoose').Types.ObjectId;


dotenv.config()
jest.setTimeout(120000)
let testWorkspaceId
const createdPrimitiveIds = new Set()

const trackPrimitive = (primitive)=>{
    if( primitive?._id ){
        createdPrimitiveIds.add(primitive._id.toString())
    }
    return primitive
}

const createTrackedPrimitive = async (...args)=>{
    const [payload, skipActions, req, options] = args
    const primitive = await createPrimitive(
        payload,
        skipActions,
        req,
        {...(options || {}), skipHooks: true}
    )
    return trackPrimitive(primitive)
}

const cleanupTrackedPrimitives = async ()=>{
    if( createdPrimitiveIds.size === 0 ){
        return
    }
    await Primitive.deleteMany({_id: {$in: Array.from(createdPrimitiveIds)}})
    createdPrimitiveIds.clear()
}

beforeAll(async ()=>{
    mongoose.set('strictQuery', false);
   await mongoose.connect(process.env.MONGOOSE_URL_TESTDB, { serverSelectionTimeoutMS: 5000 });

    const workspace = await Workspace.create({
        title: 'Shared Functions Test Workspace',
        description: 'Temporary workspace for SharedFunction tests',
        users: []
    })
    testWorkspaceId = workspace._id.toString()
})

afterEach(async ()=>{
    await cleanupTrackedPrimitives()
})

afterAll(async ()=>{
    await cleanupTrackedPrimitives()

    if( testWorkspaceId ){
        await Workspace.deleteOne({_id: testWorkspaceId})
        testWorkspaceId = undefined
    }

    await mongoose.disconnect()
})


describe("Connection", () => {
    test('Create primitive with invalid type should fail', async () => {
        await expect(createPrimitive({data:{type:"INVALID"}}, undefined, undefined, {skipHooks: true})).rejects.toThrow(/not recognized/);
    });
    test('Create primitive without workspace should fail', async () => {
        await expect(createPrimitive({data:{type:"activity", referenceId: 30}}, undefined, undefined, {skipHooks: true})).rejects.toThrow(/Cant create without a workspace/);
    });
    test('Create primitive defaults to empty path', async () => {
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"activity",
                    referenceId: 30
                },
                workspaceId: testWorkspaceId
            }) 
        
        expect( newPrim.plainId ).toBeDefined()
        expect( newPrim.primitives ).toEqual( {} )
        expect( newPrim.parentPrimitives ).toEqual( {} )

        await Primitive.deleteOne({_id: newPrim._id})
    })
    test('Create prompt fails unless it has a question parent', async () => {
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"activity",
                    referenceId: 30
                },
                workspaceId: testWorkspaceId
            }) 

        const child = createPrimitive({
                data:{
                    type:"prompt",
                    referenceId: 13
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }, undefined, undefined, {skipHooks: true}) 
    
        await expect(child).rejects.toThrow(/with parent of type/)

        await Primitive.deleteOne({_id: newPrim._id})
    })
    test('Create prompt passes if it has a question parent', async () => {
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"question"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"prompt",
                    referenceId: 13
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }) 
        expect( newPrim ).toBeDefined(undefined)
        expect( child ).toBeDefined(undefined)
    

        await Primitive.deleteOne({_id: newPrim._id})
        await Primitive.deleteOne({_id: child._id})
    })
    test('Creating child primitive should setup links to parent, and from parent to child', async () => {
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
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
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
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
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
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
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }) 
        const child2 = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
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
        let newPrim = await createTrackedPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }) 
        const child2 = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }) 

        newPrim = await fetchPrimitive( newPrim.id)
        {
            const children = await primitiveChildren( newPrim )
            expect( children ).toBeDefined()
            expect( children.length ).toEqual(2)
            expect( children.map((d)=>d._id.toString()) ).toEqual([child._id.toString(), child2._id.toString()])
        }


        expect( (await Primitive.findOne({_id: child._id})).deleted ).toBeUndefined()
        await removePrimitiveById( child._id.toString() )
        expect( (await Primitive.findOne({_id: child._id})).deleted ).toEqual(true)

        newPrim = await fetchPrimitive( newPrim.id)
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
            out.push( await createTrackedPrimitive({
                data:{
                    type:type,
                    ...(type === "activity" ? {referenceId: 30} : type === "evidence" ? {referenceId: 3} : {})
                },
                parent: parent ? parent._id.toString() : undefined,
                workspaceId: testWorkspaceId
            }) )
        }
        return out
    }

    const buildNested = async ()=>{
        const rootList =  await addPrimitives()
        const rootDoc = rootList[0]

        const resultLayerDocs = await addPrimitives(2, "result", rootDoc)
        const nestedResultLayerDocs = await addPrimitives(1, "result", resultLayerDocs[0])
        const questionLayerDocs = await addPrimitives(2, "question", resultLayerDocs[1])
        const nestedQuestionLayerDocs = await addPrimitives(1, "question", questionLayerDocs[0])
        const deepestQuestionLayerDocs = await addPrimitives(1, "question", nestedQuestionLayerDocs[0])

        const toIds = (docs)=>docs.map((d)=>d._id.toString())

        return {
            root: rootDoc._id.toString(),
            resultLayer: toIds(resultLayerDocs),
            nestedResultLayer: toIds(nestedResultLayerDocs),
            questionLayer: toIds(questionLayerDocs),
            nestedQuestionLayer: toIds(nestedQuestionLayerDocs),
            deepestQuestionLayer: toIds(deepestQuestionLayerDocs),
            all: [
                rootDoc._id.toString(),
                ...toIds(resultLayerDocs),
                ...toIds(nestedResultLayerDocs),
                ...toIds(questionLayerDocs),
                ...toIds(nestedQuestionLayerDocs),
                ...toIds(deepestQuestionLayerDocs)
            ]
        }
    }

    test('Descendants should traverse multiple layers', async () => {
        const tree = await buildNested()

        expect(tree.all.length).toEqual(8)
        
        const root = await Primitive.findOne({_id: tree.root})
        const list = await primitiveDescendents(root)
        expect(list.length).toEqual(7)

        const descendantIds = list.map((d)=>d._id.toString()).sort()
        const expectedIds = tree.all.filter((id)=>id !== tree.root).sort()
        expect(descendantIds).toEqual(expectedIds)

        await Primitive.deleteMany({_id: {$in: tree.all}})
    })
    test('Descendants should stop at nodes if they match a defined type', async () => {
        const tree = await buildNested()

        expect(tree.all.length).toEqual(8)
        
        const root = await Primitive.findOne({_id: tree.root})

        const resultDescendants = await primitiveDescendents(root, "result")
        const resultIds = resultDescendants.map((d)=>d._id.toString()).sort()
        expect(resultIds).toEqual([...tree.resultLayer].sort())
        for(const id of tree.nestedResultLayer){
            expect(resultIds).not.toContain(id)
        }

        const questionDescendants = await primitiveDescendents(root, "question")
        const questionIds = questionDescendants.map((d)=>d._id.toString()).sort()
        const expectedQuestionIds = [...tree.questionLayer].sort()
        expect(questionIds).toEqual(expectedQuestionIds)
        for(const id of [...tree.nestedQuestionLayer, ...tree.deepestQuestionLayer]){
            expect(questionIds).not.toContain(id)
        }

        await Primitive.deleteMany({_id: {$in: tree.all}})
    })

    test('Removing a primtiive should trigger deletion of origin descendants, and return a list of deleted ids', async () => {
        const newPrim = await createTrackedPrimitive({
                data:{
                    type:"venture"
                },
                workspaceId: testWorkspaceId
            }) 

        const child = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }) 
        const child2 = await createTrackedPrimitive({
                data:{
                    type:"search",
                    referenceId: 67
                },
                parent: newPrim._id.toString(),
                workspaceId: testWorkspaceId
            }) 
        const child3 = await createTrackedPrimitive({
                data:{
                    type:"question"
                },
                parent: child._id.toString(),
                workspaceId: testWorkspaceId
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
        const fan = 3
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
        const tree = await buildNested()
        const tree2 = await buildNested()

        expect(tree.all.length).toEqual(8)
        expect(tree2.all.length).toEqual(8)
        
        const root = await Primitive.findOne({_id: tree.root})
        const list = await primitiveDescendents(root)
        expect(list.length).toEqual(7)

        const root2 = await Primitive.findOne({_id: tree2.root})
        const leaf = await Primitive.findOne({_id: tree.deepestQuestionLayer[0]})
        await addRelationship(leaf._id.toString(), root2._id.toString(), "test")

        const _root = await Primitive.findOne({_id: tree.root})
        const _list = await primitiveDescendents(_root, undefined, {paths: []})
        expect(_list.length).toEqual(15)

        const removedIds = await removePrimitiveById(root._id.toString())
        expect(removedIds.length).toEqual(tree.all.length)

        for(const test of tree.all){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toEqual(true)
        }
        for(const test of tree2.all){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toBeUndefined()
        }

        await Primitive.deleteMany({_id: {$in: tree.all}})
        await Primitive.deleteMany({_id: {$in: tree2.all}})
        await Primitive.deleteOne({_id: leaf._id})
    })
    test('Delete should only cascade through origin and auto relationship - pt 2', async () => {
        const tree = await buildNested()
        const tree2 = await buildNested()

        expect(tree.all.length).toEqual(8)
        expect(tree2.all.length).toEqual(8)
        
        const root = await Primitive.findOne({_id: tree.root})
        const list = await primitiveDescendents(root)
        expect(list.length).toEqual(7)

        const root2 = await Primitive.findOne({_id: tree2.root})
        const leaf = await Primitive.findOne({_id: tree.deepestQuestionLayer[0]})
        await addRelationship(leaf._id.toString(), root2._id.toString(), "auto")

        const _root = await Primitive.findOne({_id: tree.root})
        const _list = await primitiveDescendents(_root, undefined, {paths: []})
        expect(_list.length).toEqual(15)

        const removedIds = await removePrimitiveById(root._id.toString())
        expect(removedIds.length).toEqual(tree.all.length + tree2.all.length)

        for(const test of tree.all){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toEqual(true)
        }
        for(const test of tree2.all){
            const refresh = await Primitive.findOne({_id: test})
            expect(refresh.deleted).toEqual(true)
        }

        await Primitive.deleteMany({_id: {$in: tree.all}})
        await Primitive.deleteMany({_id: {$in: tree2.all}})
        await Primitive.deleteOne({_id: leaf._id})
    })
})
afterAll(async ()=>{
    await mongoose.disconnect()
})
