import MainStore from "../MainStore.js"

let prims
let idx 
const arrayEquals = function(a,b) {
    if( a === undefined || b=== undefined){return false}
    if( a.length !== b.length ){return false}
    return b.reduce((r,c,idx)=>r && (a[idx] === c), true)
}

function buildTestPrimitive(data){
    const prim = {
        type: "evidence",
        title: `${data.type ?? "Primitive"} ${idx}`,
        ...data,
        id: `${idx}`,
        primitives:{},
        parentPrimitives:{}
    }
    idx++
    prims.push(prim)
    return prim
}
function addChild(prim, data){
    const newPrim  = buildTestPrimitive(data)
    prim.primitives.origin ||= []
    prim.primitives.origin.push( newPrim.id )
    newPrim.parentPrimitives[prim.id] = ["origin"]
    return newPrim
}
function link(parent, child, rel){
    parent.primitives[rel] ||= []
    parent.primitives[rel].push(child.id)

    child.parentPrimitives[parent.id] ||= []
    child.parentPrimitives[parent.id].push("primitives." + rel)
}
function test4(){
    prims = []
    idx = 1000

    const testIds = []
    for(let i = 0; i < 110; i++){
        const bucket = Math.floor(i / 10)
        const prim = buildTestPrimitive({title: `Test for ${bucket}`, referenceParameters: {count: bucket < 10 ? bucket : undefined}})
        testIds.push(prim.id)
    }

    const teststore = MainStore(prims)
    const checkList = testIds.map(d=>teststore.primitive(d))
    const primitive = checkList[0]

    console.log(`Test param`)
    for(let p = 0; p < 10; p++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parameter",
                param: "count",
                value: [p]
            }
        ])
        console.assert( filtered.length === 10 )
        console.assert(filtered.reduce((a,d)=>a && d.title === `Test for ${p}`, true))
    }
    console.log(`Test param multi`)
    for(let p = 0; p < 9; p++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parameter",
                param: "count",
                value: [p, p + 1]
            }
        ])
        console.assert( filtered.length === 20 )
        console.assert(filtered.reduce((a,d)=>a && (d.title === `Test for ${p}` || d.title === `Test for ${p + 1}`), true))
    }
    console.log(`Test param invert`)
    for(let p = 0; p < 10; p++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parameter",
                param: "count",
                value: [p],
                invert: true
            }
        ])
        console.assert( filtered.length === 100 )
        console.assert(filtered.reduce((a,d)=>a && d.title !== `Test for ${p}`, true))
    }
    console.log(`Test param null`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parameter",
                param: "count",
                value: [undefined],
                invert: true
            }
        ])
        console.assert( filtered.length === 100 )
        console.assert(filtered.reduce((a,d)=>a && d.title !== `Test for 10`, true))
    }
    console.log(`Test param null`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parameter",
                param: "count",
                value: [undefined],
            }
        ])
        console.assert( filtered.length === 10 )
        console.assert(filtered.reduce((a,d)=>a && d.title === `Test for 10`, true))
    }
}

function test3(){
    prims = []
    idx = 1000

    const questions = [
        buildTestPrimitive({title:"Q1", type: "question"}),
        buildTestPrimitive({title:"Q2", type: "question"})]

    

    const testIds = []
    for(let q = 0; q < 3; q++){
        let prompts = []
        if( q < 2){
            for(let p = 0; p < 5; p++){
                const prompt = addChild(questions[q], {title: `Prompt ${q} ${p}`, type: "prompt"})
                prompts.push(prompt)
            }
        }
        for(let i = 0; i < 10; i++){
            const p = i % 5
            const prim = buildTestPrimitive({title: `Test on ${q}`})
            if( q < 2){
                link( prompts[p], prim, "auto")
            }
            testIds.push(prim.id)
        }
    }

    const teststore = MainStore(prims)
    const checkList = testIds.map(d=>teststore.primitive(d))
    const qprims = questions.map(d=>teststore.primitive(d.id))
    const primitive = checkList[0]

    console.log(`Testing question filters`)
    console.assert( qprims[0].primitives.allIds.length === 5)
    console.assert( qprims[1].primitives.allIds.length === 5)
    console.assert( qprims[0].primitives.descendants.filter(d=>d.type === "evidence").length === 10)
    console.assert( qprims[1].primitives.descendants.filter(d=>d.type === "evidence").length === 10)
    for(let p = 0; p < 5; p++){
        console.assert( qprims[0].primitives.allPrompt[p].primitives.allIds.length === 2)
        console.assert( qprims[1].primitives.allPrompt[p].primitives.allIds.length === 2)
    }

    
    console.log(`Testing question filters 2`)
    for(let q = 0; q < 2; q++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                subtype: "question",
                map: [qprims[q].id]
            }
        ])
        console.assert(filtered.length === 10)
        console.assert(filtered.reduce((a,d)=>a && d.title === `Test on ${q}`, true))
    }
    console.log(`Testing question invert`)
    for(let q = 0; q < 2; q++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                subtype: "question",
                map: [qprims[q].id],
                invert: true
            }
        ])
        console.assert(filtered.length === 20)
        console.assert(filtered.reduce((a,d)=>a && (d.title === `Test on ${1 - q}` || d.title === `Test on 2`), true))
    }
    console.log(`Testing question NULL`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                subtype: "question",
                map: [undefined],
                invert: true
            }
        ])
        console.assert(filtered.length === 20)
        console.assert(filtered.reduce((a,d)=>a && (d.title === `Test on 0` || d.title === `Test on 1`), true))
    }
    console.log(`Testing question NULL`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                subtype: "question",
                map: [undefined]
            }
        ])
        console.assert(filtered.length === 10)
        console.assert(filtered.reduce((a,d)=>a && (d.title === `Test on 2`), true))
    }
    console.log(`Testing question NULL`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                subtype: "question",
                map: [undefined, qprims[0].id]
            }
        ])
        console.assert(filtered.length === 20)
        console.assert(filtered.reduce((a,d)=>a && (d.title === `Test on 0` || d.title === `Test on 2`), true))
    }

}
function test2(){
    prims = []
    idx = 1000

    const searches = [
        buildTestPrimitive({title:"Search 1", type: "search"}),
        buildTestPrimitive({title:"Search 2", type: "search"})]

    const testIds = []
    for(let i = 0; i < 40; i++){
        const s = Math.floor(i / 20) 
        const prim = buildTestPrimitive({title: `Test ${ i < 32 ? s : 3}`})
        if( i < 32){
            link( searches[s], prim, "origin")
        }
        testIds.push(prim.id)
    }

    const teststore = MainStore(prims)
    const checkList = testIds.map(d=>teststore.primitive(d))
    const sprims = searches.map(d=>teststore.primitive(d.id))
    const primitive = checkList[0]

    console.log(`Testing search filters`)
    console.assert( sprims[0].primitives.allIds.length === 20)
    console.assert( sprims[1].primitives.allIds.length === 12)
    console.log(`Testing search filters 2`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                pivot: 1,
                relationship:"origin",
                subtype: "search",
                map: [sprims[1].id]
            }
        ])
        console.assert(filtered.length === 12)
        console.assert(filtered.reduce((a,d)=>a && d.title === "Test 1", true))
    }
    console.log(`Testing search filters null`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "question",
                pivot: 1,
                relationship:"origin",
                subtype: "search",
                map: [undefined]
            }
        ])
        console.assert(filtered.length === 8)
        console.assert(filtered.reduce((a,d)=>a && d.title === "Test 3", true))
    }

}
function test1(){
    prims = []
    idx = 1000

    const cat1 = buildTestPrimitive({title:"Category 1", type: "category"})
    for(let i = 0; i < 10; i++){addChild(cat1, {title: `1 / Sub ${i}`, type: "category"})}
    const cat2 = buildTestPrimitive({title:"Category 2", type: "category"})
    for(let i = 0; i < 10; i++){addChild(cat2, {title: `2 / Sub ${i}`, type: "category"})}

    const testIds = []
    for(let i = 0; i < 200; i++){
        const col = Math.floor(i / 2) % 10
        const row = Math.floor(Math.floor(i / 2) / 10)
        const prim = buildTestPrimitive({title: `Test ${col} / ${row}`})
        link(prims.find(d=>d.title === `1 / Sub ${col}`), prim, "ref")
        if( row > 0){
            link(prims.find(d=>d.title === `2 / Sub ${row}`), prim, "ref")
        }
        testIds.push(prim.id)
    }


    const teststore = MainStore(prims)
    
    const checkList = testIds.map(d=>teststore.primitive(d))
    const primitive = teststore.primitive(1000)
    const columnCat = teststore.primitive(cat1.id)
    const rowCat = teststore.primitive(cat2.id)

    console.log(`Test basic`)
    console.assert( arrayEquals(teststore.primitive(1000).primitives.allIds, ["1001","1002","1003","1004","1005","1006","1007","1008","1009", "1010"]), "Basic test")
    console.assert( arrayEquals(teststore.primitive(1011).primitives.allIds, ["1012","1013","1014","1015","1016","1017","1018","1019","1020", "1021"]), "Basic test")
    console.log(`Test column`)
    for(let c = 0; c < 10; c++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parent",
                sourcePrimId: columnCat.id,
                value: [columnCat.primitives.allIds[c]]
            }
        ])
        const re = /Test (\d+) \/ (\d+)/
        console.assert(filtered.reduce((a,d)=>{
            const m = d.title.match(re)
            return a && (parseInt(m[1]) === c)
        }, true))
        console.assert(filtered.length === 20, "Column test 2")
    }
    console.log(`Test row`)
    for(let r = 0; r < 10; r++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parent",
                sourcePrimId: rowCat.id,
                value: [rowCat.primitives.allIds[r]]
            }
        ])
        if( r === 0){
            console.assert( filtered.length === 0)
        }else{
            const re = /Test (\d+) \/ (\d+)/
            console.assert(filtered.reduce((a,d)=>{
                const m = d.title.match(re)
                return a && (parseInt(m[2]) === r)
            }, true))
            console.assert(filtered.length === 20, "Row test 2")
        }
    }
    console.log(`Test both`)
    for(let r = 0; r < 10; r++){
        for(let c = 0; c < 10; c++){
            const filtered = primitive.filterItems( checkList, [
                {
                    type: "parent",
                    sourcePrimId: rowCat.id,
                    value: [rowCat.primitives.allIds[r]]
                },
                {
                    type: "parent",
                    sourcePrimId: columnCat.id,
                    value: [columnCat.primitives.allIds[c]]
                }
            ])
            if( r === 0){
                console.assert( filtered.length === 0)
            }else{
                const re = /Test (\d+) \/ (\d+)/
                console.assert(filtered.reduce((a,d)=>{
                    const m = d.title.match(re)
                    return a && (parseInt(m[1]) === c) && (parseInt(m[2]) === r)
                }, true))
                console.assert(filtered.length === 2, "Both test 2")
            }
        }
    }

    console.log(`Test multi column`)
    for(let c = 0; c < 9; c++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parent",
                sourcePrimId: columnCat.id,
                value: [columnCat.primitives.allIds[c], columnCat.primitives.allIds[c + 1]]
            }
        ])
        const re = /Test (\d+) \/ (\d+)/
        console.assert(filtered.reduce((a,d)=>{
            const m = d.title.match(re)
            return a && ((parseInt(m[1]) === c ) || (parseInt(m[1]) === c + 1))
        }, true))
        console.assert(filtered.length === 40, "Multi column test 2")
    }

    console.log(`Test column with null for row`)
    for(let c = 0; c < 10; c++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "not_category_level1",
                sourcePrimId: rowCat.id
            },
            {
                type: "parent",
                sourcePrimId: columnCat.id,
                value: [columnCat.primitives.allIds[c]]
            }
        ])
        const re = /Test (\d+) \/ (\d+)/
        console.assert(filtered.reduce((a,d)=>{
            const m = d.title.match(re)
            return a && (parseInt(m[1]) === c) && (parseInt(m[2]) === 0)
        }, true))
        console.assert(filtered.length === 2, "Column test 2")
    }
    console.log(`Test column with null for row v2`)
    for(let c = 0; c < 10; c++){
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parent",
                sourcePrimId: rowCat.id,
                value: [null, rowCat.primitives.allIds[1]]
            },
            {
                type: "parent",
                sourcePrimId: columnCat.id,
                value: [columnCat.primitives.allIds[c]]
            }
        ])
        const re = /Test (\d+) \/ (\d+)/
        console.assert(filtered.reduce((a,d)=>{
            const m = d.title.match(re)
            return a && (parseInt(m[1]) === c) && ((parseInt(m[2]) === 0) || (parseInt(m[2]) === 1))
        }, true))
        console.assert(filtered.length === 4, "Column test 2")
    }
    console.log(`Test inverse`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parent",
                sourcePrimId: rowCat.id,
                value: [null, rowCat.primitives.allIds[2]],
                invert: true
            }
        ])
        const re = /Test (\d+) \/ (\d+)/
        console.assert(filtered.reduce((a,d)=>{
            const m = d.title.match(re)
            return a && (parseInt(m[2]) !== 2)
        }, true))
        console.assert(filtered.length === 160, "inverse test 2")

    }
    console.log(`Test inverse`)
    {
        const filtered = primitive.filterItems( checkList, [
            {
                type: "parent",
                sourcePrimId: rowCat.id,
                value: [rowCat.primitives.allIds[3]],
                invert: true
            }
        ])
        const re = /Test (\d+) \/ (\d+)/
        console.assert(filtered.reduce((a,d)=>{
            const m = d.title.match(re)
            return a && (parseInt(m[2]) !== 3)
        }, true))
        console.assert(filtered.length === 180, "inverse test 2")

    }

    
}
export default function test(){
    test1()
    test2()
    test3()
    test4()
}
