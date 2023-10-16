import React from 'react';
import { Page, Text, Image, Font, Document, StyleSheet, PDFViewer, View, Svg, Polygon, G, Rect , Path} from '@react-pdf/renderer';
import { UserCircleIcon } from '@heroicons/react/24/outline';

Font.register({
    family: 'Handlee',
    fonts: [
      {
        src: 'https://fonts.gstatic.com/s/handlee/v5/cNycqCSU8dNAVKEAWPvbqw.ttf',
        fontWeight:400
      }
    ]})
Font.register({
    family: 'Inter',
    fonts: [
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf',
        fontWeight: 100,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuDyfMZhrib2Bg-4.ttf',
        fontWeight: 200,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuOKfMZhrib2Bg-4.ttf',
        fontWeight: 300,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf',
        fontWeight: 400,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fMZhrib2Bg-4.ttf',
        fontWeight: 500,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf',
        fontWeight: 600,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf',
        fontWeight: 700,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuDyYMZhrib2Bg-4.ttf',
        fontWeight: 800,
      },
      {
        src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuBWYMZhrib2Bg-4.ttf',
        fontWeight: 900,
      },
    ],
  });

const styles = StyleSheet.create({
    headerName: {
        fontSize: 30,
        paddingHorizontal: 5,
        paddingVertical: 5,
        fontWeight: 400,
    },
    headerSub: {
        fontSize: 15,
        paddingHorizontal: 3,
        paddingVertical: 3,
        fontWeight: 300,
    },
    headerOverview: {
        fontSize: 12,
        paddingHorizontal: 3,
        paddingVertical: 3,
        fontWeight: 200,
    },
    overview: {
        fontSize: 12,
        paddingHorizontal: 10,
        paddingVertical: 2,
        marginVertical:4 ,
        fontWeight:300,
        color: "#4b5563"
    },
    viewer:{
        height: '100%'
    },
    avatar:{
        width:160,
        height:160,
        borderRadius:80,
    },
    header:{
        paddingHorizontal: 10,
        paddingVertical: 10,
        minHeight:150,
        color:"white",
        display:"flex",
        flexDirection:"row"
    },
    base:{
        paddingHorizontal: 10,
        paddingVertical: 10,
        display:"flex",
        flexDirection:"row"
    },
    block:{
        marginHorizontal: 5,
        marginVertical: 5,
        paddingHorizontal: 5,
        paddingVertical: 5,
    },
    page:{
        fontFamily: 'Inter'
    },
    quote:{
        display:"flex",
        flexDirection:"row",
        paddingHorizontal: 5,
        marginVertical: 8,
        marginHorizontal: 25,
        paddingVertical: 6,
        fontSize: 15,
        fontWeight:400,
        fontFamily: "Handlee",
        color: "#1f2937",
        width:"42%"
    },  
    card:{
        display:"flex",
        flexDirection:"row",
        paddingHorizontal: 5,
        marginVertical: 5,
        paddingVertical: 6,
        border: "1px solid #d1d5db",
        borderRadius: 5,
        fontSize: 10,
        fontWeight:300,
        color: "#1f2937",
        width:"24%"
    },  
    sectionHeader:{
        marginBottom:5,
        fontSize: 10,
        fontWeight:400,
        color: "#1f2937"
    },
    twoColumn:{
        display: 'flex',
        flexWrap: 'wrap',
        flexDirection: 'row',
        justifyContent: 'space-between',
        width:"100%"
    }
  });


export function ReportPage({primitive, ...props}){
    function filterHighlights(list){
        const total = list.map((d)=>d.referenceParameters?.important).filter((d)=>d)
        if( total.length === 0){
            return list
        }
        return list.filter((d)=>d.referenceParameters?.important)
    }



  const evidence = primitive.primitives.allEvidence
  const responses =  filterHighlights(evidence.filter((d)=>d.referenceId === props.config.leftListCategory || d.referenceId === 31))
  const problems =  filterHighlights(evidence.filter((d)=>d.referenceId === props.config.rightListCategory))
  const quotes =  filterHighlights(evidence.filter((d)=>d.referenceId === props.config.leftCallout))
  const needs =  filterHighlights(evidence.filter((d)=>d.referenceId === 4))
    return (
    <Page size={ [612.0 * 1.5 , 792.0 * 1.5 ]} style={styles.page}>
        <View style={{...styles.header, backgroundColor: props.config.bgColor}}>
            <View style={styles.avatar}>
               {primitive.referenceParameters?.contact?.avatarUrl && <Image style={{width: 140, height:140,borderRadius: '50%', marginLeft:10, marginTop:10, objectFit: "contain", border:"7px solid white"}} source={primitive.referenceParameters?.contact?.avatarUrl}/>} 
               {!primitive.referenceParameters?.contact?.avatarUrl && <Svg>
                <G transform='scale(8)'>
                    <G transform='translate(0.25,0.25)'>
                        <Path stroke='#475569' clip-rule="evenodd" fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z"/>
                    </G>
                        <Path stroke='#f3f4f6' clip-rule="evenodd" fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z"/>
                    </G>
                </Svg>} 
            </View>
            <View style={{paddingLeft:5, flex:1}}>
                <Text style={styles.headerName} >
                    {primitive.referenceParameters?.contactName || "Anonymous Interviewee"}
                </Text>
                <Text style={styles.headerSub} >
                    {primitive.referenceParameters?.role || "Role unknown"}
                </Text>
                <Text style={styles.headerSub} >
                    {primitive.referenceParameters?.company || "Company unknown"}
                </Text>
                <Text style={styles.headerOverview} >
                    {primitive.summary || primitive.referenceParameters.summary || ""}
                </Text>
            </View>
        </View>
            <View style={{...styles.block}}>
                <Text style={styles.sectionHeader}>{props.config.rightListText}</Text>
                <View style={styles.twoColumn}>
                {problems.length > 0 && problems.map((d)=>(
                    <>
                        <View style={styles.card} wrap={false}>
                            <Svg style={{flexGrow:0, width:30,height:25}}>
                                <G transform='scale(1)'>
                                    <Path stroke='#374151' stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
                                </G>
                            </Svg>
                            <Text style={{flex: 1}} >
                                {d.title}
                            </Text>
                        </View>
                        </>
                ))}
                </View>
            </View>
            <View style={{...styles.block}}>
                <Text style={styles.sectionHeader}>{props.config.leftListText}</Text>
                <View style={styles.twoColumn}>
                {responses.length > 0 && responses.map((d)=>(
                    <>
                        <View style={styles.card} wrap={false}>
                            <Svg style={{flexGrow:0, width:30,height:25}}>
                                <G transform='scale(1)'>
                                    <Path stroke='#374151' stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
                                </G>
                            </Svg>
                            <Text style={{flex: 1}} >
                                {d.title}
                            </Text>
                        </View>
                        </>
                ))}
                </View>
            </View>
            <View style={{...styles.block}}>
                <View style={styles.twoColumn}>
                {quotes.length > 0 && quotes.map((d)=>(
                        <View style={styles.quote} wrap={false}>
                            <Svg style={{flexGrow:0, width:30,height:25}}>
                                <G transform='scale(0.04) translate(20,20)'>
                                <Path  d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
                                </G>
                            </Svg>
                            <Text style={{flex: 1}} >
                                {d.title}
                            </Text>
                            <Svg style={{flexGrow:0, width:30,height:25,marginLeft:5,bottom:0}}>
                            <G transform='scale(0.04) translate(20,20)'>
                                <Path fill='#4b5563' d="M448 296c0 66.3-53.7 120-120 120h-8c-17.7 0-32-14.3-32-32s14.3-32 32-32h8c30.9 0 56-25.1 56-56v-8H320c-35.3 0-64-28.7-64-64V160c0-35.3 28.7-64 64-64h64c35.3 0 64 28.7 64 64v32 32 72zm-256 0c0 66.3-53.7 120-120 120H64c-17.7 0-32-14.3-32-32s14.3-32 32-32h8c30.9 0 56-25.1 56-56v-8H64c-35.3 0-64-28.7-64-64V160c0-35.3 28.7-64 64-64h64c35.3 0 64 28.7 64 64v32 32 72z"/>
                            </G>
                            </Svg>
                        </View>
                ))}
                </View>
            </View>
    </Page>)

}



export default function ReportView({primitive, ...props}) {
    const config= {
        bgColor:primitive.reports?.bgColor || "#374151",
    leftListText: primitive.reports?.leftListText || "OBSERVATIONS",
    leftListCategory: primitive.reports?.leftListCategory || 4,
    rightListCategory: primitive.reports?.rightListCategory || 10,
    leftCallout: primitive.reports?.leftCallout || 52,
    rightListText: primitive.reports?.rightListText || "KEY PROBLEMS"}

    console.log(config)
    

    const reports = Array.isArray(primitive.metadata?.reports) 
                        ? primitive.primitives.results?.[primitive.metadata.reports[0]].completed.allItems.map((d)=><ReportPage primitive={d} {...props} config={config}/>)
                        : <ReportPage primitive={primitive} {...props} config={config}/>


                        console.log(reports)
                        

  return (
    <PDFViewer style={styles.viewer}>
    <Document>
       {reports} 
  </Document>
</PDFViewer>
  );
}
