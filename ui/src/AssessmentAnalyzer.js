
export default function AssessmentAnalyzer(primitive){
    let obj ={
        init:function(){
            return obj
        },
        scoreByLens:function(lensId = undefined){
            const framework = primitive.framework
            if( !framework ){return undefined}
            if( lensId === undefined ){
                return framework.lenses.map((lens, idx)=>{
                    return obj.scoreByLens(idx)
                })
            }
            const components = Object.values(framework.components).filter((c)=>c.lens === lensId)
            const targetScores = {}
            const scores = []
            components.forEach((c)=>{
                const currentLevel = primitive.referenceParameters.levels[c.id]
                scores.push(c.levels[currentLevel]?.score)
                Object.values(c.levels).filter((d)=>d.target).forEach((d)=>{
                    targetScores[d.phaseId] = targetScores[d.phaseId] || []
                    targetScores[d.phaseId].push( {component: c.id, score: d.score, level: d.id})
                })
            })
            const score = scores.reduce((a, d)=>a + (d || 0), 0) / components.length
            const targets = Object.keys(targetScores).map((c)=>{
                return {score: targetScores[c].reduce((a, d)=>a + (d.score || 0), 0) / targetScores[c].length, id:c}
            })
            
            return {
                score: score,
                targets: targets,
                max: Math.max(...targets.map((d)=>d.score))
            }
        }
    }
    return obj
}
    