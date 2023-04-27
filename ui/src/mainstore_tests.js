import MainStore from "./MainStore"


let teststore = MainStore(
    [
        {
            "id": 4417,
            "type": "hypothesis",
            "title": "Financial wellbeing encompasses delaing with the past, managing todays finances and preparing for the future.  It is different to financial advice and is an unserved market",
            "primitives": {
                null: [4421],
                levels: {
                    3891: {
                        "negative": [4444],
                        "positive": [4446,4448]
                    },
                    3892:{
                        "positive": [4444],
                    }
                }
            }
        },
        {
            "id": 4418,
            "type": "hypothesis",
            "title": "In order to prepare for the future, and to deal with the past, Co-workers first to need to have a solid foundation for today's financial needs",
            "primitives": [
                4421,
                {}
            ]
        },
        {
            "id": 4421,
            "type": "experiment",
            "state": "closed",
            "referenceId": 1,
            "referenceParameters": {
                "anonymous": true,
                "sample": 250,
                "geography": "USA",
                "sourced": "3rd party"
            },
            "userIds": {
                "owner": [
                    1
                ],
                "other": [
                    2,
                    3
                ]
            },
            "title": "High level survey of 2000 people across 7 markets",
            "primitives": [
                4445,
                {
                    "origin": [
                        4444
                    ]
                }
            ]
        },
        {
            "id": 4425,
            "type": "hypothesis",
            "title": "Low earners, gen-z and millenials working in retail have the strongest need",
            "primitives": [
                4421,
                {}
            ]
        },
        {
            "id": 4430,
            "type": "hypothesis",
            "title": "Poor employee financial wellness costs enterprises big $$$ (lost productivity, employee retention issues, employee recruitment)",
            "primitives": [
                {
                    "positive": [
                        4444
                    ]
                }
            ]
        },
        {
            "id": 4444,
            "type": "evidence",
            "title": "A significant portion of the respondents scored the proposed solution highly",
            "referenceId": 1,
            "referenceParameters": {
                "value": 8.6
            },
            "primitives": [
                {}
            ]
        },
        {
            "id": 4445,
            "type": "result",
            "title": "Survey analysis - US batch 4",
            "referenceId": 0,
            "referenceParameters": {
                "link": "https://docs.google.com/document/d/1V383HJ0GbJ1FQNYtcfHxK_lJjAJpugr8g0l9ckGbh_Y"
            },
            "primitives": [
                {
                    "origin": [
                        4446
                    ]
                }
            ]
        },
        {
            "id": 4446,
            "type": "evidence",
            "title": "Quicker access to earned wages is a top 3 priority",
            "referenceId": 2,
            "referenceParameters": {},
            "primitives": [
                {}
            ]
        },
        {
            "id": 4447,
            "type": "result",
            "title": "Discussion with ConEd",
            "referenceId": 1,
            "referenceParameters": {
                "contact": "Eric Davis",
                "company": "ConEd",
                "notes": "https://docs.google.com/document/d/1V383HJ0GbJ1FQNYtcfHxK_lJjAJpugr8g0l9ckGbh_Y",
                "interviewee": 1
            },
            "primitives": [
                {
                    "origin": [
                        4448
                    ]
                }
            ]
        },
        {
            "id": 4448,
            "type": "evidence",
            "title": "A lot of people jump to feasibility and viability too quickly - we think you should start at desirability.",
            "referenceId": 3,
            "referenceParameters": {},
            "primitives": [
                {}
            ]
        },
        {
            "id": 4449,
            "type": "experiment",
            "state": "active",
            "referenceId": 2,
            "referenceParameters": {
                "sample": "20",
                "source": "Network"
            },
            "userIds": {
                "owner": [
                    1
                ],
                "other": [
                    2,
                    3
                ]
            },
            "title": "Get feedback from ay least 20 target users from our network",
            "primitives": [
                4447,
                {}
            ]
        }
    ]

)

window.teststore = teststore
const arrayEquals = function(a,b) {
    if( a === undefined || b=== undefined){return false}
    if( a.length !== b.length ){return false}
    return b.reduce((r,c,idx)=>r && (a[idx] === c), true)
}

export default function MainStoreTests(){
    {
        let data = {
            id: 1,
            primitives: [
                2,
                3,
                {
                    b: [4,5,6],
                    c:  [7,8]
                }
            ]
        }

        let test = new Proxy(data.primitives, teststore.structure)
        test.add(9, {a: {b: "c"}})
        console.assert( arrayEquals(test.a.b.c.allIds, [9]) )
        test.add(11, {a: {b: {c: 4}}})
        console.assert( arrayEquals(test.a.b.c[4].allIds, [11]) )
        console.assert( arrayEquals(test.a.b.c.allIds, [9,11]) )
    }
    {
        let data = {
            id: 1,
            primitives: [
                2,
                3,
                {
                    b: [4,5,6],
                    c:  [7,8]
                }
            ]
        }

        let test = new Proxy(data.primitives, teststore.structure)
        test.add(11, {a: {b: {c: 4}}})
        console.assert( arrayEquals(test.a.b.c[4].allIds, [11]) )
        test.add(9, {a: {b: "c"}})
        console.assert( arrayEquals(test.a.b.c.allIds, [11,9]) )
    }
    {
        let data = {
            id: 1,
            primitives: [
                2,
                3,
                {
                    a: [4,5,6],
                    b:  [7,8]
                }
            ]
        }

        let test = new Proxy(data.primitives, teststore.structure)
        console.assert( arrayEquals(test.ids, [2,3]) )
        console.assert( arrayEquals(test.allIds, [2,3,4,5,6,7,8]) )
        console.assert( arrayEquals(test.a, [4,5,6]) )
        console.assert( arrayEquals(test.b, [7,8]) )
    }
    {
        let data = {
            id: 1,
            primitives: {
                null: [
                    2,
                    3,
                    {
                        a: [4,5,6],
                        b:  [7,8]
                    }
                ],
                test2: [
                    9,
                    10,
                    {
                        a: [11,5,6],
                        b:  [12,8]
                    }
                ],
                test3: {
                    a: {
                        b: [13,14],
                        c: [15]
                    },
                    b: {
                        b: [16,17],
                        c: [18]
                    }
                }
            }
        }

        let test = new Proxy(data.primitives, teststore.structure)
        console.assert( arrayEquals(test.allIds, [2,3,4,5,6,7,8,9,10,11,5,6,12,8,13,14,15,16,17,18]) )
        console.assert( arrayEquals(test.null.ids, [2,3]) )
        console.assert( arrayEquals(test.null.ids, [2,3]) )
        console.assert( arrayEquals(test.null.allIds, [2,3,4,5,6,7,8]) )
        console.assert( arrayEquals(test.a, [4,5,6]) )
        console.assert( arrayEquals(test.b, [7,8]) )
        console.assert( arrayEquals(test.null.a, [4,5,6]) )
        console.assert( arrayEquals(test.null.b, [7,8]) )
        console.assert( arrayEquals(test.test2.a, [11,5,6]) )
        console.assert( arrayEquals(test.test2.b, [12,8]) )
        console.assert( arrayEquals(test.test2.ids, [9,10]) )
        console.assert( arrayEquals(test.test2.allIds, [9,10,11,5,6,12,8]) )
        console.assert( arrayEquals(test.test3.allIds, [13,14,15,16,17,18]) )
        console.assert( arrayEquals(test.test3.a.allIds, [13,14,15]) )
        console.assert( arrayEquals(test.test3.b.allIds, [16,17,18]) )
        console.assert( arrayEquals(test.test3.a.b, [13,14]) )
        console.assert( arrayEquals(test.test3.b.b, [16,17]) )
        test.allIds.forEach((id)=>{
            console.assert( test.includes(id) === true )
            console.assert( test.includes(id * 100) === false )
        })                
    }
    {
        let data = {
            id: 1,
            primitives: {
                null: [
                    2,
                    4,
                    4,
                    3,
                    {
                        a: [4,5,6],
                        b:  [7,8]
                    }
                ],
                test2: [
                    9,
                    10,
                    {
                        a: [11,5,6],
                        b:  [12,8]
                    }
                ],
                test3: {
                    a: {
                        b: [13,14],
                        c: [15,4]
                    },
                    b: {
                        b: [16,17],
                        c: [18]
                    }
                }
            }
        }
        let test = new Proxy(data.primitives, teststore.structure)
        window.test_data = test
        console.assert( arrayEquals(test.allIds, [2, 4, 4,3, 4, 5, 6, 7, 8, 9, 10, 11, 5, 6, 12, 8, 13, 14, 15, 4, 16, 17, 18]) )
        console.assert( arrayEquals(test.uniqueAllIds, [2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) )
        console.assert( arrayEquals(test.ids, [2, 4, 4,3]))
        console.assert( arrayEquals(test.uniqueIds, [2, 4, 3]))
        console.assert( test.ids.length === 4)
        console.assert( test.uniqueIds.length === 3)
        console.assert( arrayEquals(test.paths(4), ['','.a','.test3.a.c']) )
        console.assert( test.paths(40) === undefined )
        console.assert( arrayEquals(test.relationships(4), ['','a','c']) )
        console.assert( arrayEquals(test.fromPath({test2: "a"}), [11,5,6]))
        console.assert( test.allIds.length == 23)
    }
    {
        let p = teststore.primitive(4417)
        console.assert( arrayEquals(p.primitives.ids, [4421]) )
        console.assert( arrayEquals(p.primitives.allIds, [4421,4444,4446,4448,4444]) )
        console.assert( arrayEquals(p.primitives.levels.allIds, [4444,4446,4448,4444]) )
        console.assert( arrayEquals(p.primitives.levels.uniqueAllIds, [4444,4446,4448]) )
        console.assert( arrayEquals(p.primitives.levels["3891"].allIds, [4444,4446,4448]) )
        console.assert( arrayEquals(p.primitives.levels["3891"].negative.ids, [4444]) )
        console.assert( arrayEquals(p.primitives.levels["3891"].positive.ids, [4446,4448]) )

        console.assert( arrayEquals(teststore.primitive(4421).parentPrimitiveIds, [4417, 4418, 4425]))
        console.assert( teststore.primitive(4444).parentRelationship(4417).join(",") === "negative,positive" )
        console.assert( teststore.primitive(4448).parentRelationship(4417)[0] === "positive" )
    }
    {
        var data = {
            id: 1,
            primitives: [
                    2,
                    4,
                    4,
                    3,
                    {
                        a: [4,5,6],
                        b:  [7,8]
                    }
                ]
        }
        var test = new Proxy(data.primitives, teststore.structure)
        window.test_data = test
        console.assert( arrayEquals(test.fromPath({4: "a"}), [4,5,6]))
        console.assert( test.allIds.length == 9)
    }
    {
        let data = {
            id: 1,
            primitives: {
                null: [
                    2,
                    4,
                    4,
                    3,
                    {
                        a: [4,5,6],
                        b:  [7,8]
                    }
                ],
                test2: [
                    9,
                    10,
                    {
                        a: [11,5,6],
                        b:  [12,8]
                    }
                ],
                test3: {
                    a: {
                        b: [13,14],
                        c: [15,4]
                    },
                    b: {
                        b: [16,17],
                        c: [18]
                    }
                }
            }
        }
        let test = new Proxy(data.primitives, teststore.structure)
        window.test_data = test
        console.assert( arrayEquals(test.add( 99, {test2: "a"}).allIds, [11,5,6,99]))
        console.assert( arrayEquals(test.uniqueAllIds, [2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 99, 12, 13, 14, 15, 16, 17, 18]) )
        console.assert( arrayEquals(test.add( 100, "test2").allIds, [9,10,11,5,6,99,12,8,100]))
        console.assert( arrayEquals(test.uniqueAllIds,  [2, 4, 3, 5, 6, 7, 8, 9, 10, 11, 99, 12, 100, 13, 14, 15, 16, 17, 18]) )
        console.assert( arrayEquals(test.add( 101).allIds, [2, 4, 4, 3, 4, 5, 6, 7, 8, 101, 9, 10, 11, 5, 6, 99, 12, 8, 100, 13, 14, 15, 4, 16, 17, 18]))
        console.assert( arrayEquals(test.remove( 101).allIds, [2, 4, 4, 3, 4, 5, 6, 7, 8, 9, 10, 11, 5, 6, 99, 12, 8, 100, 13, 14, 15, 4, 16, 17, 18]))
        console.assert( arrayEquals(test.add( 99, {test2: "a"}).allIds, [11,5,6,99,99]))
        console.assert( arrayEquals(test.remove( 99, {test2: "a"}).allIds, [11,5,6]))


        console.assert( test.fromPath({test3: "z"}) === undefined)
        console.assert( arrayEquals(test.add( 102, {test3: "z"}).allIds, [102]))

        test.move( 5, {test2: "a"},{test2: "b"})
        console.assert( arrayEquals(test.test2.a.allIds, [11,6]))
        console.assert( arrayEquals(test.test2.b.allIds, [12,8,5]))
    }
    console.log("Done")
}