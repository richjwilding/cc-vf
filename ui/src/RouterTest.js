import { useEffect, useLayoutEffect, useMemo, useReducer, useRef,useState } from "react";
import { OrthogonalConnector } from "./router";


    let anim

let move = undefined, dx, dy, t = 0
let wasDrag = false
const s = 0.04
let focus = {left: 10, top: 1000, width: 10000, height: 10000, blur: 0.02}
    let paths = {}

export default function RouterTest(){
    const ref = useRef()
    const [update, setUpdate] = useReducer((x)=>x+1,0)
    const [target, setTarget] = useState({left: 290, top: 8355})


    // Define shapes
 /*   let shapes = []
    for(let idx = 0; idx < 10; idx = idx){
        const shape = {id: `shape${idx}`, 
            left: 5 + Math.random() * 1200,  
            top: 5 + Math.random() * 1200,  
            width: 30, 
            height: 30}
        const clash = shapes.find(d=>{
            return ((d.left+d.width) > shape.left &&  d.left < (shape.left+shape.width) && (d.top + d.height) > shape.top && d.top < (shape.top + shape.height))
        })
        if( !clash){
            idx++
            shapes.push(shape)
        }
    }


    shapes = shapes.map(d=>({...d, left: Math.round(d.left), top: Math.round(d.top)}))*/


    const shapes = [
        {
            "id": "67d013093bb660691e479f33",
            "left": 0,
            "top": 0,
            "width": 364,
            "height": 210
        },
        {
            "id": "67cdbcbcae4f3fd134f950be",
            "left": 10616.343234257945,
            "top": 22058.43100105163,
            "width": 2356,
            "height": 1649
        },
        {
            "id": "67cd5637ae4f3fd134f94f8b",
            "left": 11038.119918252723,
            "top": 18769.23129107687,
            "width": 2356,
            "height": 1979
        },
        {
            "id": "67cc3803ae4f3fd134f94ecc",
            "left": 11041.233195146844,
            "top": 17312.053681807094,
            "width": 2356,
            "height": 843.5526900994046
        },
        {
            "id": "67cb21e793be88204b389a63",
            "left": 7057.402986915627,
            "top": 11654.504634917685,
            "width": 2355.999999999999,
            "height": 1001
        },
        {
            "id": "67cb21d493be88204b389a4d",
            "left": 10680.761333559298,
            "top": 11389.159140500073,
            "width": 1151.2000000000007,
            "height": 703
        },
        {
            "id": "67c9592d3dbe9957160e8b5a",
            "left": 2997.735289027596,
            "top": -6681.013708970839,
            "width": 659.423077898276,
            "height": 514.719456814486
        },
        {
            "id": "67c82d7f5b315218f2586648",
            "left": 2763.270298470984,
            "top": -5668.904839417453,
            "width": 559.9534017877054,
            "height": 387.19885377601076
        },
        {
            "id": "67c81a080c554f97be176450",
            "left": 10940.16346398488,
            "top": -3515.721289832173,
            "width": 933.3333333333339,
            "height": 507
        },
        {
            "id": "67c5cd305424fe1378e3f2a1",
            "left": 8457.839747073556,
            "top": 7116.335585338258,
            "width": 1501.1134684367134,
            "height": 689.8665333784529
        },
        {
            "id": "67c5cb975424fe1378e3f245",
            "left": 4726.897963527931,
            "top": -4788.2737059736455,
            "width": 2356,
            "height": 771.5526900994028
        },
        {
            "id": "67c5ca615424fe1378e3f060",
            "left": 8453.513876270774,
            "top": 6184.3009844427725,
            "width": 1466.639237278967,
            "height": 662.1229402241106
        },
        {
            "id": "67c5c52c5424fe1378e3ec76",
            "left": 8484.439249346546,
            "top": 5287.536290002818,
            "width": 1452.0382359220712,
            "height": 641.7004200197098
        },
        {
            "id": "67c5c1645424fe1378e3ea65",
            "left": 8480.786714093188,
            "top": 4384.644759492618,
            "width": 1257.3856511671584,
            "height": 619.7428878849241
        },
        {
            "id": "67c58bbb5424fe1378e3e45b",
            "left": 8469.920631151259,
            "top": 3391.36443211143,
            "width": 1618.5472686625762,
            "height": 779.7705002955672
        },
        {
            "id": "67c57663b530761e38766a9f",
            "left": 8501.013832635352,
            "top": 2711.7832932296074,
            "width": 1330.0730111482262,
            "height": 606.1000139525827
        },
        {
            "id": "67c0a0239487308d5323d640",
            "left": 6012.197163270467,
            "top": 7539.703389680491,
            "width": 807.2429687499998,
            "height": 1944.999999999999
        },
        {
            "id": "67bc913f72f79920f70a9f10",
            "left": 4361.4995269128085,
            "top": -1073.9174659388518,
            "width": 364,
            "height": 210
        },
        {
            "id": "67a4ba642cb8b3ebbfd7effa",
            "left": 4998.3621935001165,
            "top": -1099.1856508619376,
            "width": 587.2214843749998,
            "height": 1978
        },
        {
            "id": "67d0125c3bb660691e479e9b",
            "left": 9821.015721267404,
            "top": 25654.138693248125,
            "width": 696,
            "height": 210
        },
        {
            "id": "67cb2bf093be88204b389b6e",
            "left": 12750.354174674785,
            "top": 12806.36873011657,
            "width": 8925.020496972656,
            "height": 3437.272000000001
        },
        {
            "id": "67c9656d8ab60baab88b40c9",
            "left": 11468.060537658914,
            "top": -2920.772018690247,
            "width": 290.1278794835107,
            "height": 78.31215255981624
        },
        {
            "id": "67c960b98ab60baab88b3c8d",
            "left": 11718.687287892113,
            "top": -2239.507314126357,
            "width": 105.88630431270394,
            "height": 290.1278794835098
        },
        {
            "id": "67c8863215773429b84cc677",
            "left": 11410.784062397755,
            "top": -2814.352801918111,
            "width": 346.54030661263823,
            "height": 405.3586182500967
        },
        {
            "id": "67c87aada1ea20aefa1f8151",
            "left": 10833.409420078895,
            "top": -2865.7497833825655,
            "width": 107.87469881129437,
            "height": 385.5941226040477
        },
        {
            "id": "67c70b085424fe1378e3fa56",
            "left": 11721.993517054381,
            "top": 3145.7099924585054,
            "width": 159.82435574052397,
            "height": 4091.6473772022873
        },
        {
            "id": "67c0a0139487308d5323d623",
            "left": 5172.971316718954,
            "top": 8064.770567691266,
            "width": 523.2429687499998,
            "height": 766.0000000000009
        },
        {
            "id": "67bc3067d976f521ab90a6c5",
            "left": 4885.7469903630945,
            "top": 2432.1484598774273,
            "width": 523.2429687499998,
            "height": 766
        },
        {
            "id": "67adbcaa55a24c3f4034dc7c",
            "left": 6268.947432433798,
            "top": 1460.744626087833,
            "width": 310,
            "height": 382
        },
        {
            "id": "67aa3a52cc1264abac133299",
            "left": 4420.808894766878,
            "top": -1456.130052629886,
            "width": 238,
            "height": 210
        },
        {
            "id": "67a5df0f0e9137335fdd01fe",
            "left": 6913.206232317733,
            "top": -2177.9219736036353,
            "width": 3010.000000000001,
            "height": 692
        },
        {
            "id": "67a334c68b0cf071859ac520",
            "left": -1333.1053825157496,
            "top": -705.4381005531686,
            "width": 418,
            "height": 210
        },
        {
            "id": "67c70ae35424fe1378e3fa45",
            "left": 12643.339712597042,
            "top": 3971.463725784387,
            "width": 472.4389561407679,
            "height": 265.7469128291814
        },
        {
            "id": "67c70ee05424fe1378e3fbe2",
            "left": 12673.000988976195,
            "top": 3984.2881646298247,
            "width": 414.0607595777965,
            "height": 21.93179478100501
        },
        {
            "id": "67c70d1c5424fe1378e3fb48",
            "left": 12871.26491415905,
            "top": 4015.8805654557045,
            "width": 216.05137249667678,
            "height": 37.329817394117526
        },
        {
            "id": "67c70cfc5424fe1378e3fb21",
            "left": 12675.720391976016,
            "top": 4018.858127948096,
            "width": 172.85638019598082,
            "height": 27.178189342063888
        },
        {
            "id": "67a5d9e48bf1951e2d712d3b",
            "left": 6022.34385447401,
            "top": 71.89504799533914,
            "width": 504,
            "height": 104.00000000000001
        },
        {
            "id": "67d045be1378311eece045b4",
            "left": 16365.672484312436,
            "top": 19547.18507038349,
            "width": 510,
            "height": 360.7000000000007
        },
        {
            "id": "67d01dbbc6e7d77a5ba62cdc",
            "left": 13396.905139135517,
            "top": 24778.216458352268,
            "width": 510,
            "height": 1361.779702855707
        },
        {
            "id": "67cfeb85f795e218119c4103",
            "left": 15623.996638470046,
            "top": 19545.53288925744,
            "width": 510,
            "height": 486.7000000000007
        },
        {
            "id": "67cdd24aae4f3fd134f95174",
            "left": 14579.244244283038,
            "top": 22197.504302858015,
            "width": 510,
            "height": 2419.294801223241
        },
        {
            "id": "67cdd18eae4f3fd134f95116",
            "left": 15887.757172332585,
            "top": 18635.61837242541,
            "width": 510,
            "height": 360.7000000000007
        },
        {
            "id": "67cdbdcfae4f3fd134f950dd",
            "left": 13741.892172263957,
            "top": 22254.288952180043,
            "width": 510,
            "height": 913.4190963341862
        },
        {
            "id": "67cd5655ae4f3fd134f94fa3",
            "left": 14110.92724836341,
            "top": 19625.674502750946,
            "width": 510,
            "height": 409.7000000000007
        },
        {
            "id": "67cc38adae4f3fd134f94ef0",
            "left": 14320.950049899146,
            "top": 17208.596121111594,
            "width": 510,
            "height": 287.2000000000007
        },
        {
            "id": "67c9c8ec94064074bc9c1160",
            "left": 5620.051831115238,
            "top": 4400.571971327753,
            "width": 230.81721642079356,
            "height": 567.39091750017
        },
        {
            "id": "67c9adf1703508acc958d143",
            "left": 5339.234614694445,
            "top": 4400.571971327753,
            "width": 230.81721642079356,
            "height": 2330.805858817789
        },
        {
            "id": "67c960f08ab60baab88b3cbb",
            "left": 11874.573592204817,
            "top": -2239.507314126357,
            "width": 190.18665621669606,
            "height": 1067.9442494243917
        },
        {
            "id": "67c959563dbe9957160e8b72",
            "left": 3870.71209990433,
            "top": -6619.783065830546,
            "width": 142.74438443468625,
            "height": 114.18151300025511
        },
        {
            "id": "67c87beca1ea20aefa1f8188",
            "left": 11135.51381988587,
            "top": -2874.8218556388415,
            "width": 190.18665621669606,
            "height": 1669.3916997968945
        },
        {
            "id": "67c87a6ba1ea20aefa1f8123",
            "left": 7293.173388242427,
            "top": -4519.870105680868,
            "width": 510,
            "height": 1160.9591645353794
        },
        {
            "id": "67c8680e5b315218f2587c0e",
            "left": 3832.3597544092313,
            "top": -5544.920113357875,
            "width": 64.27289802866153,
            "height": 41.92861406693282
        },
        {
            "id": "67c862db5b315218f25879c7",
            "left": 3668.520405835326,
            "top": -5544.920113357877,
            "width": 113.83934857389977,
            "height": 91.06031813867139
        },
        {
            "id": "67c831fa5b315218f2587715",
            "left": 3504.6810572614263,
            "top": -5544.920113357877,
            "width": 113.83934857389977,
            "height": 108.63845284493527
        },
        {
            "id": "67c5cdc55424fe1378e3f321",
            "left": 10010.440311584342,
            "top": 7336.268515293266,
            "width": 129.84529662529167,
            "height": 139.51209395763544
        },
        {
            "id": "67c5cd975424fe1378e3f2e0",
            "left": 10396.961953505755,
            "top": 7074.73583675446,
            "width": 129.84529662529167,
            "height": 109.655625993164
        },
        {
            "id": "67c5cccd5424fe1378e3f25f",
            "left": 7335.252345087631,
            "top": -5265.331308641865,
            "width": 540,
            "height": 516.6999999999998
        },
        {
            "id": "67c5cb1b5424fe1378e3f0e3",
            "left": 10054.610060679914,
            "top": 6354.701994383483,
            "width": 126.86329901836325,
            "height": 126.27481518961395
        },
        {
            "id": "67c5cafd5424fe1378e3f09f",
            "left": 10339.079596358455,
            "top": 6103.260698784811,
            "width": 126.86329901836325,
            "height": 99.30162542770722
        },
        {
            "id": "67c5c5bd5424fe1378e3ece3",
            "left": 9977.640207096361,
            "top": 5496.929945251194,
            "width": 125.60032230669276,
            "height": 123.27711843442103
        },
        {
            "id": "67c5c5825424fe1378e3ec9d",
            "left": 10170.400336745799,
            "top": 5268.392899119767,
            "width": 125.60032230669276,
            "height": 98.31303659770856
        },
        {
            "id": "67c5c2465424fe1378e3eaed",
            "left": 9971.375255926283,
            "top": 4635.185645802227,
            "width": 122.33244603114326,
            "height": 121.31880394594646
        },
        {
            "id": "67c5c1c95424fe1378e3ea89",
            "left": 10240.016515296553,
            "top": 4443.880140338759,
            "width": 122.33244603114326,
            "height": 171.53859469545569
        },
        {
            "id": "67c58c945424fe1378e3e588",
            "left": 10272.015690848195,
            "top": 3242.0733165717006,
            "width": 157.4702607817453,
            "height": 284.7385621387716
        },
        {
            "id": "67c58c2c5424fe1378e3e481",
            "left": 10244.919771843532,
            "top": 3571.4130461272316,
            "width": 157.4702607817453,
            "height": 156.77922156394243
        },
        {
            "id": "67c587415424fe1378e3e3de",
            "left": 10190.58940466957,
            "top": 2645.1865633958223,
            "width": 115.05041310813976,
            "height": 119.78018557678706
        },
        {
            "id": "67c57958477e9ff72da2b422",
            "left": 9962.961838562995,
            "top": 2851.8025681138715,
            "width": 156.10771807737183,
            "height": 153.22022504814913
        },
        {
            "id": "67c1c6c1b530761e38764e6a",
            "left": 7480.615235108821,
            "top": 2732.2247888332868,
            "width": 383.4697613020153,
            "height": 2096.824949555931
        },
        {
            "id": "67c15de93f371e3002273962",
            "left": 5536.593152712158,
            "top": 2784.771402993048,
            "width": 510,
            "height": 448.1999999999998
        },
        {
            "id": "67c0c5943f371e30022737f4",
            "left": 9291.853934204031,
            "top": 1802.2000946405858,
            "width": 510,
            "height": 423.70000000000005
        },
        {
            "id": "67c0c2613f371e3002273773",
            "left": 11327.190711237145,
            "top": 1888.0475674044053,
            "width": 510,
            "height": 133.20000000000005
        },
        {
            "id": "67c08fa0d781262060ef22ba",
            "left": 10679.45296805639,
            "top": 1833.001610017715,
            "width": 510,
            "height": 423.6999999999998
        },
        {
            "id": "67c07bf1d781262060eef5b5",
            "left": 8372.5747341758,
            "top": 1760.5135624831846,
            "width": 510,
            "height": 423.6999999999998
        },
        {
            "id": "67aa39bfcc1264abac13322b",
            "left": 3860.0039264038696,
            "top": 1856.7283284497194,
            "width": 510,
            "height": 338.60519877675824
        },
        {
            "id": "67a5d74cfd5cc44e96fabd7b",
            "left": 2665.8844924805717,
            "top": 240.25671058413204,
            "width": 510,
            "height": 828.8284403669724
        },
        {
            "id": "67a491028cd9a6a8690b61b0",
            "left": 3054.4839418675315,
            "top": -763.4318855971006,
            "width": 510,
            "height": 199.69999999999993
        },
        {
            "id": "67a48b188cd9a6a8690b6058",
            "left": 2234.1466009306737,
            "top": -847.4911892809758,
            "width": 510,
            "height": 425.45
        },
        {
            "id": "67a3838d0f5825e1b4ed0766",
            "left": 1682.3270487036484,
            "top": -3345.0277140313333,
            "width": 574.6482236991073,
            "height": 2193.1197745221557
        },
        {
            "id": "67a375bdd68082c25de4c8a1",
            "left": 996.6890241444547,
            "top": -717.921289772714,
            "width": 510.0000000000001,
            "height": 7438.630491158269
        },
        {
            "id": "67a34bd4153958d2f97cd213",
            "left": 87.39696462943051,
            "top": -693.0797653954872,
            "width": 510,
            "height": 318.7
        },
        {
            "id": "67cc366fa1ea20aefa204026",
            "left": 9751.29733963338,
            "top": 22238.128594150887,
            "width": 504,
            "height": 104
        },
        {
            "id": "67cc3425a1ea20aefa204008",
            "left": 10128.937585225553,
            "top": 19054.71091067691,
            "width": 504,
            "height": 104
        },
        {
            "id": "67cc109b2ce3d2d3981e7642",
            "left": 10063.517840513989,
            "top": 17476.169127984245,
            "width": 504,
            "height": 104
        },
        {
            "id": "67c821d20c554f97be177843",
            "left": 2102.9438479477844,
            "top": -5521.604859725878,
            "width": 504,
            "height": 104
        },
        {
            "id": "67c811a6a1ea20aefa1df94e",
            "left": 2292.3944726534282,
            "top": -6486.594358415465,
            "width": 504,
            "height": 104
        },
        {
            "id": "67c801a2a1ea20aefa1df84a",
            "left": 3388.1845633485364,
            "top": -2379.466915800421,
            "width": 504,
            "height": 104
        },
        {
            "id": "67c0b89240b375364a26c1bc",
            "left": 3392.8990089280974,
            "top": -2626.7535096120373,
            "width": 504,
            "height": 104
        },
        {
            "id": "67c08b8140b375364a2687a9",
            "left": 2412.8478414397327,
            "top": -4635.646716075917,
            "width": 504,
            "height": 104
        },
        {
            "id": "67aa505e099da8296b2f8737",
            "left": 5581.503307861011,
            "top": 1635.4307802768083,
            "width": 504,
            "height": 104
        },
        {
            "id": "67a49fc80ebee43541053008",
            "left": 3865.7842170938416,
            "top": -163.01545988173328,
            "width": 504.00000000000045,
            "height": 104
        },
        {
            "id": "67a4923a8cd9a6a8690b62ac",
            "left": 3869.460753778536,
            "top": -586.4540871823399,
            "width": 504,
            "height": 104
        },
        {
            "id": "67a33da78b0cf071859ac6b2",
            "left": -732.5015091729077,
            "top": -688.6397711203159,
            "width": 504,
            "height": 104
        },
        {
            "id": "67c0b74f40b375364a26c169",
            "left": 2486.7492260936183,
            "top": -2752.2876847042667,
            "width": 608.45106038729,
            "height": 346.2537238092855
        },
        {
            "id": "67c0b70b40b375364a26c15e",
            "left": 0,
            "top": 0,
            "width": 540,
            "height": 140
        },
        {
            "id": "67a4b5b80ebee43541053076",
            "left": 2270.5649526513566,
            "top": -188.50343230244457,
            "width": 540,
            "height": 261.8
        }
    ]

    function renderCallback(p){
        if( !ref.current){
            return 
        }
        for(const d of p){
            paths[d.id] = d
        }
    }

    // Get the connector path
    const router = useMemo(()=>{
        console.log(`SETTING UP OC IN WORKER`)
        const router = new OrthogonalConnector({
            shapes,
            shapeMargin: 10,
            globalBoundsMargin: 10,
            globalBounds: {left: 0, top: 0, width: 1500, height: 1500},
            focus,
            scale: 1,
            debug: true,
            renderCallback,
        })
        return router
    }, [])
    useEffect(() => {
        return () => {
          console.log('Component unmounting, shutting down router');
          if (router && typeof router.shutdown === 'function') {
            router.shutdown();
          }
        };
      }, [router]);

    const staticRoutes = useMemo(()=>{

        /*const routes = [
            {
                //pointA: {shape: shapes.find(d=>d.id === "shape0"), side: ['bottom', 'right','top','left'], distance: 0.5},
                //pointB: {shape: shapes.find(d=>d.id === "shape1"), side: ['bottom','right','top','left'],  distance: 0.5}
                pointA: {shape: shapes.find(d=>d.id === "shape0"), side: ['right'], distance: 0.5},
                pointB: {shape: shapes.find(d=>d.id === "shape1"), side: ['left'],  distance: 0.5}
            }
        ]
        while(routes.length < 3){
            const start = Math.floor(Math.random() * shapes.length)
            const end = Math.floor(Math.random() * shapes.length)
            if( start !== end && start >1 && end > 1){
                console.log(start + " ---> " + end)
                routes.push(
                    {
                        pointA: {shape: shapes.find(d=>d.id === `shape${start}`), side: 'bottom', distance: 0.5},
                        //pointB: {shape: shapes.find(d=>d.id === `shape${end}`), side: ['bottom','right','top','left'],  distance: 0.5}
                        pointB: {shape: shapes.find(d=>d.id === `shape${end}`), side: ['bottom'],  distance: 0.5}
                    }
                )
            }
        }*/

          const srcRoutes =  [
                {
                    "id": "67cdbcbcae4f3fd134f950be.4~67d01dbbc6e7d77a5ba62cdc.1",
                    "pointA": {
                        "shape": {
                            "id": "67cdbcbcae4f3fd134f950be",
                            "left": 10616.343234257945,
                            "top": 22058.43100105163,
                            "width": 2356,
                            "height": 1649
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67d01dbbc6e7d77a5ba62cdc",
                            "left": 13396.905139135517,
                            "top": 24778.216458352268,
                            "width": 510,
                            "height": 1361.779702855707
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cdbcbcae4f3fd134f950be.4~67cdbdcfae4f3fd134f950dd.1",
                    "pointA": {
                        "shape": {
                            "id": "67cdbcbcae4f3fd134f950be",
                            "left": 10616.343234257945,
                            "top": 22058.43100105163,
                            "width": 2356,
                            "height": 1649
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cdbdcfae4f3fd134f950dd",
                            "left": 13741.892172263957,
                            "top": 22254.288952180043,
                            "width": 510,
                            "height": 913.4190963341862
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cd5637ae4f3fd134f94f8b.4~67cd5655ae4f3fd134f94fa3.1",
                    "pointA": {
                        "shape": {
                            "id": "67cd5637ae4f3fd134f94f8b",
                            "left": 11038.119918252723,
                            "top": 18769.23129107687,
                            "width": 2356,
                            "height": 1979
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cd5655ae4f3fd134f94fa3",
                            "left": 14110.92724836341,
                            "top": 19625.674502750946,
                            "width": 510,
                            "height": 409.7000000000007
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cc3803ae4f3fd134f94ecc.4~67cc38adae4f3fd134f94ef0.1",
                    "pointA": {
                        "shape": {
                            "id": "67cc3803ae4f3fd134f94ecc",
                            "left": 11041.233195146844,
                            "top": 17312.053681807094,
                            "width": 2356,
                            "height": 843.5526900994046
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cc38adae4f3fd134f94ef0",
                            "left": 14320.950049899146,
                            "top": 17208.596121111594,
                            "width": 510,
                            "height": 287.2000000000007
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cb21e793be88204b389a63.4~67cb21d493be88204b389a4d.1",
                    "pointA": {
                        "shape": {
                            "id": "67cb21e793be88204b389a63",
                            "left": 7057.402986915627,
                            "top": 11654.504634917685,
                            "width": 2355.999999999999,
                            "height": 1001
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cb21d493be88204b389a4d",
                            "left": 10680.761333559298,
                            "top": 11389.159140500073,
                            "width": 1151.2000000000007,
                            "height": 703
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cb21e793be88204b389a63.4~67cb2bf093be88204b389b6e.1",
                    "pointA": {
                        "shape": {
                            "id": "67cb21e793be88204b389a63",
                            "left": 7057.402986915627,
                            "top": 11654.504634917685,
                            "width": 2355.999999999999,
                            "height": 1001
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cb2bf093be88204b389b6e",
                            "left": 12750.354174674785,
                            "top": 12806.36873011657,
                            "width": 8925.020496972656,
                            "height": 3437.272000000001
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c9592d3dbe9957160e8b5a.4~67c959563dbe9957160e8b72.1",
                    "pointA": {
                        "shape": {
                            "id": "67c9592d3dbe9957160e8b5a",
                            "left": 2997.735289027596,
                            "top": -6681.013708970839,
                            "width": 659.423077898276,
                            "height": 514.719456814486
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c959563dbe9957160e8b72",
                            "left": 3870.71209990433,
                            "top": -6619.783065830546,
                            "width": 142.74438443468625,
                            "height": 114.18151300025511
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c82d7f5b315218f2586648.4~67c831fa5b315218f2587715.1",
                    "pointA": {
                        "shape": {
                            "id": "67c82d7f5b315218f2586648",
                            "left": 2763.270298470984,
                            "top": -5668.904839417453,
                            "width": 559.9534017877054,
                            "height": 387.19885377601076
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c831fa5b315218f2587715",
                            "left": 3504.6810572614263,
                            "top": -5544.920113357877,
                            "width": 113.83934857389977,
                            "height": 108.63845284493527
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5cd305424fe1378e3f2a1.4~67c5cdc55424fe1378e3f321.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5cd305424fe1378e3f2a1",
                            "left": 8457.839747073556,
                            "top": 7116.335585338258,
                            "width": 1501.1134684367134,
                            "height": 689.8665333784529
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cdc55424fe1378e3f321",
                            "left": 10010.440311584342,
                            "top": 7336.268515293266,
                            "width": 129.84529662529167,
                            "height": 139.51209395763544
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5cd305424fe1378e3f2a1.4~67c5cd975424fe1378e3f2e0.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5cd305424fe1378e3f2a1",
                            "left": 8457.839747073556,
                            "top": 7116.335585338258,
                            "width": 1501.1134684367134,
                            "height": 689.8665333784529
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cd975424fe1378e3f2e0",
                            "left": 10396.961953505755,
                            "top": 7074.73583675446,
                            "width": 129.84529662529167,
                            "height": 109.655625993164
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5cb975424fe1378e3f245.4~67c87a6ba1ea20aefa1f8123.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5cb975424fe1378e3f245",
                            "left": 4726.897963527931,
                            "top": -4788.2737059736455,
                            "width": 2356,
                            "height": 771.5526900994028
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c87a6ba1ea20aefa1f8123",
                            "left": 7293.173388242427,
                            "top": -4519.870105680868,
                            "width": 510,
                            "height": 1160.9591645353794
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5cb975424fe1378e3f245.4~67c5cccd5424fe1378e3f25f.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5cb975424fe1378e3f245",
                            "left": 4726.897963527931,
                            "top": -4788.2737059736455,
                            "width": 2356,
                            "height": 771.5526900994028
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cccd5424fe1378e3f25f",
                            "left": 7335.252345087631,
                            "top": -5265.331308641865,
                            "width": 540,
                            "height": 516.6999999999998
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5ca615424fe1378e3f060.4~67c5cb1b5424fe1378e3f0e3.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5ca615424fe1378e3f060",
                            "left": 8453.513876270774,
                            "top": 6184.3009844427725,
                            "width": 1466.639237278967,
                            "height": 662.1229402241106
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cb1b5424fe1378e3f0e3",
                            "left": 10054.610060679914,
                            "top": 6354.701994383483,
                            "width": 126.86329901836325,
                            "height": 126.27481518961395
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5ca615424fe1378e3f060.4~67c5cafd5424fe1378e3f09f.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5ca615424fe1378e3f060",
                            "left": 8453.513876270774,
                            "top": 6184.3009844427725,
                            "width": 1466.639237278967,
                            "height": 662.1229402241106
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cafd5424fe1378e3f09f",
                            "left": 10339.079596358455,
                            "top": 6103.260698784811,
                            "width": 126.86329901836325,
                            "height": 99.30162542770722
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5c52c5424fe1378e3ec76.4~67c5c5bd5424fe1378e3ece3.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5c52c5424fe1378e3ec76",
                            "left": 8484.439249346546,
                            "top": 5287.536290002818,
                            "width": 1452.0382359220712,
                            "height": 641.7004200197098
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5c5bd5424fe1378e3ece3",
                            "left": 9977.640207096361,
                            "top": 5496.929945251194,
                            "width": 125.60032230669276,
                            "height": 123.27711843442103
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5c52c5424fe1378e3ec76.4~67c5c5825424fe1378e3ec9d.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5c52c5424fe1378e3ec76",
                            "left": 8484.439249346546,
                            "top": 5287.536290002818,
                            "width": 1452.0382359220712,
                            "height": 641.7004200197098
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5c5825424fe1378e3ec9d",
                            "left": 10170.400336745799,
                            "top": 5268.392899119767,
                            "width": 125.60032230669276,
                            "height": 98.31303659770856
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5c1645424fe1378e3ea65.4~67c5c2465424fe1378e3eaed.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5c1645424fe1378e3ea65",
                            "left": 8480.786714093188,
                            "top": 4384.644759492618,
                            "width": 1257.3856511671584,
                            "height": 619.7428878849241
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5c2465424fe1378e3eaed",
                            "left": 9971.375255926283,
                            "top": 4635.185645802227,
                            "width": 122.33244603114326,
                            "height": 121.31880394594646
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5c1645424fe1378e3ea65.4~67c5c1c95424fe1378e3ea89.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5c1645424fe1378e3ea65",
                            "left": 8480.786714093188,
                            "top": 4384.644759492618,
                            "width": 1257.3856511671584,
                            "height": 619.7428878849241
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5c1c95424fe1378e3ea89",
                            "left": 10240.016515296553,
                            "top": 4443.880140338759,
                            "width": 122.33244603114326,
                            "height": 171.53859469545569
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c58bbb5424fe1378e3e45b.4~67c58c945424fe1378e3e588.1",
                    "pointA": {
                        "shape": {
                            "id": "67c58bbb5424fe1378e3e45b",
                            "left": 8469.920631151259,
                            "top": 3391.36443211143,
                            "width": 1618.5472686625762,
                            "height": 779.7705002955672
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c58c945424fe1378e3e588",
                            "left": 10272.015690848195,
                            "top": 3242.0733165717006,
                            "width": 157.4702607817453,
                            "height": 284.7385621387716
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c58bbb5424fe1378e3e45b.4~67c58c2c5424fe1378e3e481.1",
                    "pointA": {
                        "shape": {
                            "id": "67c58bbb5424fe1378e3e45b",
                            "left": 8469.920631151259,
                            "top": 3391.36443211143,
                            "width": 1618.5472686625762,
                            "height": 779.7705002955672
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c58c2c5424fe1378e3e481",
                            "left": 10244.919771843532,
                            "top": 3571.4130461272316,
                            "width": 157.4702607817453,
                            "height": 156.77922156394243
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c57663b530761e38766a9f.4~67c587415424fe1378e3e3de.1",
                    "pointA": {
                        "shape": {
                            "id": "67c57663b530761e38766a9f",
                            "left": 8501.013832635352,
                            "top": 2711.7832932296074,
                            "width": 1330.0730111482262,
                            "height": 606.1000139525827
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c587415424fe1378e3e3de",
                            "left": 10190.58940466957,
                            "top": 2645.1865633958223,
                            "width": 115.05041310813976,
                            "height": 119.78018557678706
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c57663b530761e38766a9f.4~67c57958477e9ff72da2b422.1",
                    "pointA": {
                        "shape": {
                            "id": "67c57663b530761e38766a9f",
                            "left": 8501.013832635352,
                            "top": 2711.7832932296074,
                            "width": 1330.0730111482262,
                            "height": 606.1000139525827
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c57958477e9ff72da2b422",
                            "left": 9962.961838562995,
                            "top": 2851.8025681138715,
                            "width": 156.10771807737183,
                            "height": 153.22022504814913
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67c81a080c554f97be176450.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c81a080c554f97be176450",
                            "left": 10940.16346398488,
                            "top": -3515.721289832173,
                            "width": 933.3333333333339,
                            "height": 507
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67c9656d8ab60baab88b40c9.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c9656d8ab60baab88b40c9",
                            "left": 11468.060537658914,
                            "top": -2920.772018690247,
                            "width": 290.1278794835107,
                            "height": 78.31215255981624
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67c960b98ab60baab88b3c8d.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c960b98ab60baab88b3c8d",
                            "left": 11718.687287892113,
                            "top": -2239.507314126357,
                            "width": 105.88630431270394,
                            "height": 290.1278794835098
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67c8863215773429b84cc677.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c8863215773429b84cc677",
                            "left": 11410.784062397755,
                            "top": -2814.352801918111,
                            "width": 346.54030661263823,
                            "height": 405.3586182500967
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67c87aada1ea20aefa1f8151.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c87aada1ea20aefa1f8151",
                            "left": 10833.409420078895,
                            "top": -2865.7497833825655,
                            "width": 107.87469881129437,
                            "height": 385.5941226040477
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67a5d9e48bf1951e2d712d3b.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a5d9e48bf1951e2d712d3b",
                            "left": 6022.34385447401,
                            "top": 71.89504799533914,
                            "width": 504,
                            "height": 104.00000000000001
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4ba642cb8b3ebbfd7effa.4~67aa505e099da8296b2f8737.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67aa505e099da8296b2f8737",
                            "left": 5581.503307861011,
                            "top": 1635.4307802768083,
                            "width": 504,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c960b98ab60baab88b3c8d.4~67c960f08ab60baab88b3cbb.1",
                    "pointA": {
                        "shape": {
                            "id": "67c960b98ab60baab88b3c8d",
                            "left": 11718.687287892113,
                            "top": -2239.507314126357,
                            "width": 105.88630431270394,
                            "height": 290.1278794835098
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c960f08ab60baab88b3cbb",
                            "left": 11874.573592204817,
                            "top": -2239.507314126357,
                            "width": 190.18665621669606,
                            "height": 1067.9442494243917
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c87aada1ea20aefa1f8151.4~67c87beca1ea20aefa1f8188.1",
                    "pointA": {
                        "shape": {
                            "id": "67c87aada1ea20aefa1f8151",
                            "left": 10833.409420078895,
                            "top": -2865.7497833825655,
                            "width": 107.87469881129437,
                            "height": 385.5941226040477
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c87beca1ea20aefa1f8188",
                            "left": 11135.51381988587,
                            "top": -2874.8218556388415,
                            "width": 190.18665621669606,
                            "height": 1669.3916997968945
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c70b085424fe1378e3fa56.4~67c70ae35424fe1378e3fa45.2",
                    "pointA": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70ae35424fe1378e3fa45",
                            "left": 12643.339712597042,
                            "top": 3971.463725784387,
                            "width": 472.4389561407679,
                            "height": 265.7469128291814
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c0a0139487308d5323d623.4~67c0a0239487308d5323d640.1",
                    "pointA": {
                        "shape": {
                            "id": "67c0a0139487308d5323d623",
                            "left": 5172.971316718954,
                            "top": 8064.770567691266,
                            "width": 523.2429687499998,
                            "height": 766.0000000000009
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0a0239487308d5323d640",
                            "left": 6012.197163270467,
                            "top": 7539.703389680491,
                            "width": 807.2429687499998,
                            "height": 1944.999999999999
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67bc3067d976f521ab90a6c5.4~67cb21d493be88204b389a4d.1",
                    "pointA": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cb21d493be88204b389a4d",
                            "left": 10680.761333559298,
                            "top": 11389.159140500073,
                            "width": 1151.2000000000007,
                            "height": 703
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67bc3067d976f521ab90a6c5.4~67cb2bf093be88204b389b6e.1",
                    "pointA": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cb2bf093be88204b389b6e",
                            "left": 12750.354174674785,
                            "top": 12806.36873011657,
                            "width": 8925.020496972656,
                            "height": 3437.272000000001
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67bc3067d976f521ab90a6c5.4~67c9adf1703508acc958d143.1",
                    "pointA": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c9adf1703508acc958d143",
                            "left": 5339.234614694445,
                            "top": 4400.571971327753,
                            "width": 230.81721642079356,
                            "height": 2330.805858817789
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67bc3067d976f521ab90a6c5.4~67c15de93f371e3002273962.1",
                    "pointA": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c15de93f371e3002273962",
                            "left": 5536.593152712158,
                            "top": 2784.771402993048,
                            "width": 510,
                            "height": 448.1999999999998
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67bc3067d976f521ab90a6c5.4~67c07bf1d781262060eef5b5.1",
                    "pointA": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c07bf1d781262060eef5b5",
                            "left": 8372.5747341758,
                            "top": 1760.5135624831846,
                            "width": 510,
                            "height": 423.6999999999998
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67aa3a52cc1264abac133299.4~67a4ba642cb8b3ebbfd7effa.1",
                    "pointA": {
                        "shape": {
                            "id": "67aa3a52cc1264abac133299",
                            "left": 4420.808894766878,
                            "top": -1456.130052629886,
                            "width": 238,
                            "height": 210
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67aa3a52cc1264abac133299.4~67c0a0139487308d5323d623.1",
                    "pointA": {
                        "shape": {
                            "id": "67aa3a52cc1264abac133299",
                            "left": 4420.808894766878,
                            "top": -1456.130052629886,
                            "width": 238,
                            "height": 210
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0a0139487308d5323d623",
                            "left": 5172.971316718954,
                            "top": 8064.770567691266,
                            "width": 523.2429687499998,
                            "height": 766.0000000000009
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67aa3a52cc1264abac133299.4~67bc3067d976f521ab90a6c5.1",
                    "pointA": {
                        "shape": {
                            "id": "67aa3a52cc1264abac133299",
                            "left": 4420.808894766878,
                            "top": -1456.130052629886,
                            "width": 238,
                            "height": 210
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a334c68b0cf071859ac520.4~67cb21e793be88204b389a63.1",
                    "pointA": {
                        "shape": {
                            "id": "67a334c68b0cf071859ac520",
                            "left": -1333.1053825157496,
                            "top": -705.4381005531686,
                            "width": 418,
                            "height": 210
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cb21e793be88204b389a63",
                            "left": 7057.402986915627,
                            "top": 11654.504634917685,
                            "width": 2355.999999999999,
                            "height": 1001
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a334c68b0cf071859ac520.4~67a33da78b0cf071859ac6b2.1",
                    "pointA": {
                        "shape": {
                            "id": "67a334c68b0cf071859ac520",
                            "left": -1333.1053825157496,
                            "top": -705.4381005531686,
                            "width": 418,
                            "height": 210
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a33da78b0cf071859ac6b2",
                            "left": -732.5015091729077,
                            "top": -688.6397711203159,
                            "width": 504,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a5d9e48bf1951e2d712d3b.3~67a5df0f0e9137335fdd01fe.1",
                    "pointA": {
                        "shape": {
                            "id": "67a5d9e48bf1951e2d712d3b",
                            "left": 6022.34385447401,
                            "top": 71.89504799533914,
                            "width": 504,
                            "height": 104.00000000000001
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a5df0f0e9137335fdd01fe",
                            "left": 6913.206232317733,
                            "top": -2177.9219736036353,
                            "width": 3010.000000000001,
                            "height": 692
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cfeb85f795e218119c4103.5~67d045be1378311eece045b4.1",
                    "pointA": {
                        "shape": {
                            "id": "67cfeb85f795e218119c4103",
                            "left": 15623.996638470046,
                            "top": 19545.53288925744,
                            "width": 510,
                            "height": 486.7000000000007
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67d045be1378311eece045b4",
                            "left": 16365.672484312436,
                            "top": 19547.18507038349,
                            "width": 510,
                            "height": 360.7000000000007
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cdbdcfae4f3fd134f950dd.6~67cdd24aae4f3fd134f95174.1",
                    "pointA": {
                        "shape": {
                            "id": "67cdbdcfae4f3fd134f950dd",
                            "left": 13741.892172263957,
                            "top": 22254.288952180043,
                            "width": 510,
                            "height": 913.4190963341862
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cdd24aae4f3fd134f95174",
                            "left": 14579.244244283038,
                            "top": 22197.504302858015,
                            "width": 510,
                            "height": 2419.294801223241
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cd5655ae4f3fd134f94fa3.7~67cfeb85f795e218119c4103.1",
                    "pointA": {
                        "shape": {
                            "id": "67cd5655ae4f3fd134f94fa3",
                            "left": 14110.92724836341,
                            "top": 19625.674502750946,
                            "width": 510,
                            "height": 409.7000000000007
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cfeb85f795e218119c4103",
                            "left": 15623.996638470046,
                            "top": 19545.53288925744,
                            "width": 510,
                            "height": 486.7000000000007
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cd5655ae4f3fd134f94fa3.7~67cdd18eae4f3fd134f95116.1",
                    "pointA": {
                        "shape": {
                            "id": "67cd5655ae4f3fd134f94fa3",
                            "left": 14110.92724836341,
                            "top": 19625.674502750946,
                            "width": 510,
                            "height": 409.7000000000007
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cdd18eae4f3fd134f95116",
                            "left": 15887.757172332585,
                            "top": 18635.61837242541,
                            "width": 510,
                            "height": 360.7000000000007
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c9adf1703508acc958d143.7~67c9c8ec94064074bc9c1160.1",
                    "pointA": {
                        "shape": {
                            "id": "67c9adf1703508acc958d143",
                            "left": 5339.234614694445,
                            "top": 4400.571971327753,
                            "width": 230.81721642079356,
                            "height": 2330.805858817789
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c9c8ec94064074bc9c1160",
                            "left": 5620.051831115238,
                            "top": 4400.571971327753,
                            "width": 230.81721642079356,
                            "height": 567.39091750017
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c862db5b315218f25879c7.4~67c8680e5b315218f2587c0e.1",
                    "pointA": {
                        "shape": {
                            "id": "67c862db5b315218f25879c7",
                            "left": 3668.520405835326,
                            "top": -5544.920113357877,
                            "width": 113.83934857389977,
                            "height": 91.06031813867139
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c8680e5b315218f2587c0e",
                            "left": 3832.3597544092313,
                            "top": -5544.920113357875,
                            "width": 64.27289802866153,
                            "height": 41.92861406693282
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c831fa5b315218f2587715.6~67c862db5b315218f25879c7.1",
                    "pointA": {
                        "shape": {
                            "id": "67c831fa5b315218f2587715",
                            "left": 3504.6810572614263,
                            "top": -5544.920113357877,
                            "width": 113.83934857389977,
                            "height": 108.63845284493527
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c862db5b315218f25879c7",
                            "left": 3668.520405835326,
                            "top": -5544.920113357877,
                            "width": 113.83934857389977,
                            "height": 91.06031813867139
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5cdc55424fe1378e3f321.5~67c70b085424fe1378e3fa56.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5cdc55424fe1378e3f321",
                            "left": 10010.440311584342,
                            "top": 7336.268515293266,
                            "width": 129.84529662529167,
                            "height": 139.51209395763544
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5cb1b5424fe1378e3f0e3.5~67c70b085424fe1378e3fa56.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5cb1b5424fe1378e3f0e3",
                            "left": 10054.610060679914,
                            "top": 6354.701994383483,
                            "width": 126.86329901836325,
                            "height": 126.27481518961395
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5c5bd5424fe1378e3ece3.5~67c70b085424fe1378e3fa56.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5c5bd5424fe1378e3ece3",
                            "left": 9977.640207096361,
                            "top": 5496.929945251194,
                            "width": 125.60032230669276,
                            "height": 123.27711843442103
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c5c2465424fe1378e3eaed.5~67c70b085424fe1378e3fa56.1",
                    "pointA": {
                        "shape": {
                            "id": "67c5c2465424fe1378e3eaed",
                            "left": 9971.375255926283,
                            "top": 4635.185645802227,
                            "width": 122.33244603114326,
                            "height": 121.31880394594646
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c58c2c5424fe1378e3e481.5~67c70b085424fe1378e3fa56.1",
                    "pointA": {
                        "shape": {
                            "id": "67c58c2c5424fe1378e3e481",
                            "left": 10244.919771843532,
                            "top": 3571.4130461272316,
                            "width": 157.4702607817453,
                            "height": 156.77922156394243
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c57958477e9ff72da2b422.5~67c70b085424fe1378e3fa56.1",
                    "pointA": {
                        "shape": {
                            "id": "67c57958477e9ff72da2b422",
                            "left": 9962.961838562995,
                            "top": 2851.8025681138715,
                            "width": 156.10771807737183,
                            "height": 153.22022504814913
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c70b085424fe1378e3fa56",
                            "left": 11721.993517054381,
                            "top": 3145.7099924585054,
                            "width": 159.82435574052397,
                            "height": 4091.6473772022873
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c1c6c1b530761e38764e6a.4~67c5cd305424fe1378e3f2a1.1",
                    "pointA": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cd305424fe1378e3f2a1",
                            "left": 8457.839747073556,
                            "top": 7116.335585338258,
                            "width": 1501.1134684367134,
                            "height": 689.8665333784529
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c1c6c1b530761e38764e6a.4~67c5ca615424fe1378e3f060.1",
                    "pointA": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5ca615424fe1378e3f060",
                            "left": 8453.513876270774,
                            "top": 6184.3009844427725,
                            "width": 1466.639237278967,
                            "height": 662.1229402241106
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c1c6c1b530761e38764e6a.4~67c5c52c5424fe1378e3ec76.1",
                    "pointA": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5c52c5424fe1378e3ec76",
                            "left": 8484.439249346546,
                            "top": 5287.536290002818,
                            "width": 1452.0382359220712,
                            "height": 641.7004200197098
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c1c6c1b530761e38764e6a.4~67c5c1645424fe1378e3ea65.1",
                    "pointA": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5c1645424fe1378e3ea65",
                            "left": 8480.786714093188,
                            "top": 4384.644759492618,
                            "width": 1257.3856511671584,
                            "height": 619.7428878849241
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c1c6c1b530761e38764e6a.4~67c58bbb5424fe1378e3e45b.1",
                    "pointA": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c58bbb5424fe1378e3e45b",
                            "left": 8469.920631151259,
                            "top": 3391.36443211143,
                            "width": 1618.5472686625762,
                            "height": 779.7705002955672
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c1c6c1b530761e38764e6a.4~67c57663b530761e38766a9f.1",
                    "pointA": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c57663b530761e38766a9f",
                            "left": 8501.013832635352,
                            "top": 2711.7832932296074,
                            "width": 1330.0730111482262,
                            "height": 606.1000139525827
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c15de93f371e3002273962.7~67c1c6c1b530761e38764e6a.1",
                    "pointA": {
                        "shape": {
                            "id": "67c15de93f371e3002273962",
                            "left": 5536.593152712158,
                            "top": 2784.771402993048,
                            "width": 510,
                            "height": 448.1999999999998
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c1c6c1b530761e38764e6a",
                            "left": 7480.615235108821,
                            "top": 2732.2247888332868,
                            "width": 383.4697613020153,
                            "height": 2096.824949555931
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c08fa0d781262060ef22ba.5~67c0c2613f371e3002273773.1",
                    "pointA": {
                        "shape": {
                            "id": "67c08fa0d781262060ef22ba",
                            "left": 10679.45296805639,
                            "top": 1833.001610017715,
                            "width": 510,
                            "height": 423.6999999999998
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0c2613f371e3002273773",
                            "left": 11327.190711237145,
                            "top": 1888.0475674044053,
                            "width": 510,
                            "height": 133.20000000000005
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c07bf1d781262060eef5b5.7~67c0c5943f371e30022737f4.1",
                    "pointA": {
                        "shape": {
                            "id": "67c07bf1d781262060eef5b5",
                            "left": 8372.5747341758,
                            "top": 1760.5135624831846,
                            "width": 510,
                            "height": 423.6999999999998
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0c5943f371e30022737f4",
                            "left": 9291.853934204031,
                            "top": 1802.2000946405858,
                            "width": 510,
                            "height": 423.70000000000005
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c07bf1d781262060eef5b5.7~67c08fa0d781262060ef22ba.1",
                    "pointA": {
                        "shape": {
                            "id": "67c07bf1d781262060eef5b5",
                            "left": 8372.5747341758,
                            "top": 1760.5135624831846,
                            "width": 510,
                            "height": 423.6999999999998
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c08fa0d781262060ef22ba",
                            "left": 10679.45296805639,
                            "top": 1833.001610017715,
                            "width": 510,
                            "height": 423.6999999999998
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67aa39bfcc1264abac13322b.5~67aa505e099da8296b2f8737.2",
                    "pointA": {
                        "shape": {
                            "id": "67aa39bfcc1264abac13322b",
                            "left": 3860.0039264038696,
                            "top": 1856.7283284497194,
                            "width": 510,
                            "height": 338.60519877675824
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67aa505e099da8296b2f8737",
                            "left": 5581.503307861011,
                            "top": 1635.4307802768083,
                            "width": 504,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a5d74cfd5cc44e96fabd7b.5~67a5d9e48bf1951e2d712d3b.2",
                    "pointA": {
                        "shape": {
                            "id": "67a5d74cfd5cc44e96fabd7b",
                            "left": 2665.8844924805717,
                            "top": 240.25671058413204,
                            "width": 510,
                            "height": 828.8284403669724
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a5d9e48bf1951e2d712d3b",
                            "left": 6022.34385447401,
                            "top": 71.89504799533914,
                            "width": 504,
                            "height": 104.00000000000001
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a5d74cfd5cc44e96fabd7b.4~67aa39bfcc1264abac13322b.1",
                    "pointA": {
                        "shape": {
                            "id": "67a5d74cfd5cc44e96fabd7b",
                            "left": 2665.8844924805717,
                            "top": 240.25671058413204,
                            "width": 510,
                            "height": 828.8284403669724
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67aa39bfcc1264abac13322b",
                            "left": 3860.0039264038696,
                            "top": 1856.7283284497194,
                            "width": 510,
                            "height": 338.60519877675824
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a491028cd9a6a8690b61b0.5~67a49fc80ebee43541053008.2",
                    "pointA": {
                        "shape": {
                            "id": "67a491028cd9a6a8690b61b0",
                            "left": 3054.4839418675315,
                            "top": -763.4318855971006,
                            "width": 510,
                            "height": 199.69999999999993
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a49fc80ebee43541053008",
                            "left": 3865.7842170938416,
                            "top": -163.01545988173328,
                            "width": 504.00000000000045,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a491028cd9a6a8690b61b0.5~67a4923a8cd9a6a8690b62ac.2",
                    "pointA": {
                        "shape": {
                            "id": "67a491028cd9a6a8690b61b0",
                            "left": 3054.4839418675315,
                            "top": -763.4318855971006,
                            "width": 510,
                            "height": 199.69999999999993
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a4923a8cd9a6a8690b62ac",
                            "left": 3869.460753778536,
                            "top": -586.4540871823399,
                            "width": 504,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a48b188cd9a6a8690b6058.5~67a491028cd9a6a8690b61b0.1",
                    "pointA": {
                        "shape": {
                            "id": "67a48b188cd9a6a8690b6058",
                            "left": 2234.1466009306737,
                            "top": -847.4911892809758,
                            "width": 510,
                            "height": 425.45
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a491028cd9a6a8690b61b0",
                            "left": 3054.4839418675315,
                            "top": -763.4318855971006,
                            "width": 510,
                            "height": 199.69999999999993
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a3838d0f5825e1b4ed0766.4~67c0b74f40b375364a26c169.1",
                    "pointA": {
                        "shape": {
                            "id": "67a3838d0f5825e1b4ed0766",
                            "left": 1682.3270487036484,
                            "top": -3345.0277140313333,
                            "width": 574.6482236991073,
                            "height": 2193.1197745221557
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0b74f40b375364a26c169",
                            "left": 2486.7492260936183,
                            "top": -2752.2876847042667,
                            "width": 608.45106038729,
                            "height": 346.2537238092855
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a375bdd68082c25de4c8a1.5~67a5d74cfd5cc44e96fabd7b.1",
                    "pointA": {
                        "shape": {
                            "id": "67a375bdd68082c25de4c8a1",
                            "left": 996.6890241444547,
                            "top": -717.921289772714,
                            "width": 510.0000000000001,
                            "height": 7438.630491158269
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a5d74cfd5cc44e96fabd7b",
                            "left": 2665.8844924805717,
                            "top": 240.25671058413204,
                            "width": 510,
                            "height": 828.8284403669724
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a375bdd68082c25de4c8a1.5~67a48b188cd9a6a8690b6058.1",
                    "pointA": {
                        "shape": {
                            "id": "67a375bdd68082c25de4c8a1",
                            "left": 996.6890241444547,
                            "top": -717.921289772714,
                            "width": 510.0000000000001,
                            "height": 7438.630491158269
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a48b188cd9a6a8690b6058",
                            "left": 2234.1466009306737,
                            "top": -847.4911892809758,
                            "width": 510,
                            "height": 425.45
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a375bdd68082c25de4c8a1.5~67a3838d0f5825e1b4ed0766.1",
                    "pointA": {
                        "shape": {
                            "id": "67a375bdd68082c25de4c8a1",
                            "left": 996.6890241444547,
                            "top": -717.921289772714,
                            "width": 510.0000000000001,
                            "height": 7438.630491158269
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a3838d0f5825e1b4ed0766",
                            "left": 1682.3270487036484,
                            "top": -3345.0277140313333,
                            "width": 574.6482236991073,
                            "height": 2193.1197745221557
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a375bdd68082c25de4c8a1.5~67a4b5b80ebee43541053076.1",
                    "pointA": {
                        "shape": {
                            "id": "67a375bdd68082c25de4c8a1",
                            "left": 996.6890241444547,
                            "top": -717.921289772714,
                            "width": 510.0000000000001,
                            "height": 7438.630491158269
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a4b5b80ebee43541053076",
                            "left": 2270.5649526513566,
                            "top": -188.50343230244457,
                            "width": 540,
                            "height": 261.8
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a34bd4153958d2f97cd213.7~67a375bdd68082c25de4c8a1.1",
                    "pointA": {
                        "shape": {
                            "id": "67a34bd4153958d2f97cd213",
                            "left": 87.39696462943051,
                            "top": -693.0797653954872,
                            "width": 510,
                            "height": 318.7
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a375bdd68082c25de4c8a1",
                            "left": 996.6890241444547,
                            "top": -717.921289772714,
                            "width": 510.0000000000001,
                            "height": 7438.630491158269
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cc366fa1ea20aefa204026.4~67cdbcbcae4f3fd134f950be.1",
                    "pointA": {
                        "shape": {
                            "id": "67cc366fa1ea20aefa204026",
                            "left": 9751.29733963338,
                            "top": 22238.128594150887,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cdbcbcae4f3fd134f950be",
                            "left": 10616.343234257945,
                            "top": 22058.43100105163,
                            "width": 2356,
                            "height": 1649
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cc3425a1ea20aefa204008.4~67cd5637ae4f3fd134f94f8b.1",
                    "pointA": {
                        "shape": {
                            "id": "67cc3425a1ea20aefa204008",
                            "left": 10128.937585225553,
                            "top": 19054.71091067691,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cd5637ae4f3fd134f94f8b",
                            "left": 11038.119918252723,
                            "top": 18769.23129107687,
                            "width": 2356,
                            "height": 1979
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67cc109b2ce3d2d3981e7642.4~67cc3803ae4f3fd134f94ecc.1",
                    "pointA": {
                        "shape": {
                            "id": "67cc109b2ce3d2d3981e7642",
                            "left": 10063.517840513989,
                            "top": 17476.169127984245,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67cc3803ae4f3fd134f94ecc",
                            "left": 11041.233195146844,
                            "top": 17312.053681807094,
                            "width": 2356,
                            "height": 843.5526900994046
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c821d20c554f97be177843.4~67c82d7f5b315218f2586648.1",
                    "pointA": {
                        "shape": {
                            "id": "67c821d20c554f97be177843",
                            "left": 2102.9438479477844,
                            "top": -5521.604859725878,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c82d7f5b315218f2586648",
                            "left": 2763.270298470984,
                            "top": -5668.904839417453,
                            "width": 559.9534017877054,
                            "height": 387.19885377601076
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c811a6a1ea20aefa1df94e.4~67c9592d3dbe9957160e8b5a.1",
                    "pointA": {
                        "shape": {
                            "id": "67c811a6a1ea20aefa1df94e",
                            "left": 2292.3944726534282,
                            "top": -6486.594358415465,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c9592d3dbe9957160e8b5a",
                            "left": 2997.735289027596,
                            "top": -6681.013708970839,
                            "width": 659.423077898276,
                            "height": 514.719456814486
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c801a2a1ea20aefa1df84a.4~67c5cb975424fe1378e3f245.1",
                    "pointA": {
                        "shape": {
                            "id": "67c801a2a1ea20aefa1df84a",
                            "left": 3388.1845633485364,
                            "top": -2379.466915800421,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cb975424fe1378e3f245",
                            "left": 4726.897963527931,
                            "top": -4788.2737059736455,
                            "width": 2356,
                            "height": 771.5526900994028
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c0b89240b375364a26c1bc.4~67c5cb975424fe1378e3f245.1",
                    "pointA": {
                        "shape": {
                            "id": "67c0b89240b375364a26c1bc",
                            "left": 3392.8990089280974,
                            "top": -2626.7535096120373,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c5cb975424fe1378e3f245",
                            "left": 4726.897963527931,
                            "top": -4788.2737059736455,
                            "width": 2356,
                            "height": 771.5526900994028
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67aa505e099da8296b2f8737.5~67adbcaa55a24c3f4034dc7c.1",
                    "pointA": {
                        "shape": {
                            "id": "67aa505e099da8296b2f8737",
                            "left": 5581.503307861011,
                            "top": 1635.4307802768083,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67adbcaa55a24c3f4034dc7c",
                            "left": 6268.947432433798,
                            "top": 1460.744626087833,
                            "width": 310,
                            "height": 382
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4923a8cd9a6a8690b62ac.4~67a4ba642cb8b3ebbfd7effa.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4923a8cd9a6a8690b62ac",
                            "left": 3869.460753778536,
                            "top": -586.4540871823399,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a4ba642cb8b3ebbfd7effa",
                            "left": 4998.3621935001165,
                            "top": -1099.1856508619376,
                            "width": 587.2214843749998,
                            "height": 1978
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4923a8cd9a6a8690b62ac.4~67c0a0139487308d5323d623.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4923a8cd9a6a8690b62ac",
                            "left": 3869.460753778536,
                            "top": -586.4540871823399,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0a0139487308d5323d623",
                            "left": 5172.971316718954,
                            "top": 8064.770567691266,
                            "width": 523.2429687499998,
                            "height": 766.0000000000009
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4923a8cd9a6a8690b62ac.4~67bc3067d976f521ab90a6c5.1",
                    "pointA": {
                        "shape": {
                            "id": "67a4923a8cd9a6a8690b62ac",
                            "left": 3869.460753778536,
                            "top": -586.4540871823399,
                            "width": 504,
                            "height": 104
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67bc3067d976f521ab90a6c5",
                            "left": 4885.7469903630945,
                            "top": 2432.1484598774273,
                            "width": 523.2429687499998,
                            "height": 766
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67c0b74f40b375364a26c169.3~67c0b89240b375364a26c1bc.2",
                    "pointA": {
                        "shape": {
                            "id": "67c0b74f40b375364a26c169",
                            "left": 2486.7492260936183,
                            "top": -2752.2876847042667,
                            "width": 608.45106038729,
                            "height": 346.2537238092855
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67c0b89240b375364a26c1bc",
                            "left": 3392.8990089280974,
                            "top": -2626.7535096120373,
                            "width": 504,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4b5b80ebee43541053076.3~67a49fc80ebee43541053008.3",
                    "pointA": {
                        "shape": {
                            "id": "67a4b5b80ebee43541053076",
                            "left": 2270.5649526513566,
                            "top": -188.50343230244457,
                            "width": 540,
                            "height": 261.8
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a49fc80ebee43541053008",
                            "left": 3865.7842170938416,
                            "top": -163.01545988173328,
                            "width": 504.00000000000045,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                },
                {
                    "id": "67a4b5b80ebee43541053076.3~67a4923a8cd9a6a8690b62ac.3",
                    "pointA": {
                        "shape": {
                            "id": "67a4b5b80ebee43541053076",
                            "left": 2270.5649526513566,
                            "top": -188.50343230244457,
                            "width": 540,
                            "height": 261.8
                        },
                        "side": "right",
                        "distance": 0.5
                    },
                    "pointB": {
                        "shape": {
                            "id": "67a4923a8cd9a6a8690b62ac",
                            "left": 3869.460753778536,
                            "top": -586.4540871823399,
                            "width": 504,
                            "height": 104
                        },
                        "side": "left",
                        "distance": 0.5
                    }
                }
            ]

        router.route(srcRoutes);

    },[])



    
    // Draw shapes and path
    useLayoutEffect(()=>{
        if( ref.current){
            render()
        } 
    }, [ref.current])
    function render(){
        if( !ref.current){
            return 
        }
    
        const context = ref.current.getContext('2d');
        
        context.save(); // Save the original state
        
        context.translate(200, 200);
        context.scale(s,s);
        
        context.fillStyle = "#fafafa"
        
        context.fillRect(-200 / s, -200/s, 1400 / s, 1400 / s);
        
        context.lineWidth = 1/s
        if( true ){

            
            context.strokeStyle ="#e2e2e2"
            
            for(const d of router.byproduct.connections){
                context.beginPath();
                context.moveTo(d[0].x, d[0].y)
                context.lineTo(d[1].x, d[1].y)
                context.stroke();
                
            }
            
            context.strokeStyle ="#f0f0f0"
            for(const d of router.byproduct.vRulers){
                context.strokeRect(d, 0, 1, 1500);
                
            }
            for(const d of router.byproduct.spots){
                context.fillStyle = ["purple", "red", "blue", "green"][ d.mid ?? 0]
                context.fillRect(d.x - 0.5 / s, d.y - 0.5 /s, 1 /s, 1 /s);
                
            }
            }
            
            if( focus){
                context.strokeStyle ="red"
                context.lineWidth = 5/s
                context.strokeRect(focus.left, focus.top, focus.width, focus.height);
                context.lineWidth = 1/s
            }
            context.strokeStyle ="purple"
            
            // Draw shapes
            for(const d of Object.values(router.shapes ?? {})){
                if( d.id === "shape0"){
                    context.fillStyle = "green"
                    context.fillRect(d.left, d.top, d.width, d.height);
                }
               // context.fillStyle = d.id === move ? "blue" : "purple"
                //    context.fillRect(d.left, d.top, d.width, d.height);
                context.strokeRect(d.left, d.top, d.width, d.height);
            }
            
            // Draw path
            
            for(const link of Object.values(paths ?? {})){
                let color ="red"
                if( link.mode === 3){color = "green"}
                if( link.mode === 2){color = "blue"}
                if( link.mode === 5){color = "black"}
                context.strokeStyle = color
                const path = link.path
                if( path.length > 0 ){
                    let idx = 0
                    context.beginPath();
                    for(const p of path ){
                        if( idx === 0){
                            context.moveTo(p[0], p[1])
                        }else{
                            context.lineTo(p[0],p[1])
                        }
                        idx++
                    }
                    context.stroke();
                }
            }
          //  paths = []
            context.restore(); // Restore the original state

                    anim = undefined
        }



    const handleClick = (event) => {
        if( wasDrag ){
            wasDrag = false
            return 
        }
        if(event.shiftKey){
            setUpdate()
            render()
            return
        }

        const rect = event.target.getClientRects()[0]
        //setTarget({left: event.pageX - rect.x, top: event.pageY - rect.y})
        const left = (event.pageX - rect.x -200)/s
        const top = (event.pageY - rect.y - 200)/s

        const inShape = Object.values(router.shapes ?? {}).find(d=>left >= d.left && left < (d.left + d.width) && top >= d.top && (top < (d.top + d.height)))
        console.log(inShape)
        
        if( inShape ){
            //router.removeShape( inShape)
            move = inShape.id
            dx = left - inShape.left
            dy = top - inShape.top
        }else{
            /*router.addShape({
                id: `s${left}-${top}`,
                left,
                top,
                width: 30,
                height: 30
            })*/
        }
        
        render()
    }
    const handleMove = (event) => {
        if( event.buttons> 0 ){
            wasDrag = true
            if( !anim && move){
                const rect = event.target.getClientRects()[0]
                //setTarget({left: event.pageX - rect.x, top: event.pageY - rect.y})
                const left = (event.pageX - rect.x - 200)/s
                const top = (event.pageY - rect.y - 200)/s 
                if(focus){
                    
                    focus = {
                        left: left - focus.width / 2,
                        top: top - focus.height / 2,
                        width: focus.width,
                        height: focus.height,
                        blur: focus.blur
                    }
                    router.focus(focus)
                }
                router.moveShape(move, {
                    left: left - dx,
                    top: top - dy
                })
                
                anim = requestAnimationFrame(()=>{
                    router.route();
                    render()
                })
            }
        }
      };

    //console.log(shapes)
    /*setTimeout(()=>{
        console.log(update)
        setUpdate()
    }, 10000)*/

    return <canvas 
        ref={ref}
        onMouseMove={handleMove}
        onClick={handleClick}
        width={1400}
        height={1400}
        style={{width:"1400px",height:"1400px"}}
        >

    </canvas>

}