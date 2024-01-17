import { ReactECharts } from "./React-ECharts";

export default function ListGraph({primitive, ...props}){

    console.log(props.data)
    const option = {
        tooltip: {
        trigger: 'item'
        },
        legend: {
        top: '5%',
        textStyle:{fontSize:20},
        left: 'center'
        },
        series: [
        {
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
            },
            label: {
                show: true,
                fontSize: 20,
                formatter(param) {
                  return param.percent * 2 + '%';
                }
              },
            emphasis: {
            label: {
                show: true,
                fontSize: 40,
                fontWeight: 'bold',
                formatter(param) {
                  return param.percent * 2 + '%';
                }
            }
            },
            labelLine: {
            show: false
            },
            data: props.data
        }
        ]
    };
        return (
            <div style={{width: props.width ?? "100%", height: props.height ?? "100%"}} className={props.className} >
                <ReactECharts option={option} renderer={props.mode ?? "canvas"} />
            </div>
        )
}