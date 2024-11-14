export function roundCurrency(number){
    if(number === 0){
        return "$0"
    }
    if( isNaN(number)){
        return "-"
    }
    let prefix = "$"
    if( number < 0){
        prefix = "-$"
        number = -number
    }

    return prefix + formatNumber(number)
}
export function formatNumber(number){
    if(number === 0){
        return "0"
    }
    if( isNaN(number)){
        return "-"
    }
    const suffixes = ["", "K", "M","B","T"];
    const suffixIndex = Math.floor(Math.log10(Math.abs(number)) / 3);

    const scaledNumber = number / Math.pow(10, suffixIndex * 3);
    const formattedNumber = scaledNumber.toFixed( suffixIndex > 1 ? 0 : 2);

    return formattedNumber.replace(/\.00$/, '') + (suffixes[suffixIndex] ?? "");
}

export function convertOrganizationFinancialData( primitive, analysisTables, sections){
    let overall = ""
    let tables = 0
    sections = [sections].flat()

    for(const section of sections){
        let data = primitive.financialData?.[section]
        if( !data || Object.keys(data).length === 0){
            continue
        }
        const sectionInfo = analysisTables[section]

        let out = ""
        let validRows = 0
        if( sectionInfo.sourceType === "list"){
            const rows = Object.keys(data)
            for(const rowName of rows){
                if( data[rowName]){
                    out += "|" + (sectionInfo.rows?.[rowName] ?? rowName)+ "|" + data[rowName] + "|\n"
                    validRows++
                }
            }
        }else{
            if( Array.isArray(data)){
                data = data.reduce((a,c)=>{
                    a[c.Breakdown] = c.value
                    return a
                }, {})
            }
            const rows = Object.keys(data)
            let cols
            let showHeader = true
            for(const rowName of rows){
                let row = data[rowName]
                if( row ){
                    const rowConfig = sectionInfo.rows?.[rowName] ?? {title: rowName}
                    
                    if(rowConfig.skip){continue}

                    if(!Array.isArray(row) ){
                        row = Object.keys(row).map(d=>({column_name: sectionInfo.rows?.[2] ?? d, value: row[d]}))
                        showHeader = false
                    }
                    if(!cols){
                        cols = row.map(d=>d.column_name)
                        out = (showHeader ? "||" : "|") + cols.join("|") + "|\n"
                    }

                    let name = typeof(rowConfig) === "string" ? rowConfig : rowConfig.title


                    out += showHeader ? `|${name}|` : "|"
                    out += cols.map(c=>{
                        let v = row.find(d=>d.column_name === c)?.value ?? "" 
                        if( rowConfig.format === "currency"){
                            const asFloat = parseFloat(v)
                            if( !isNaN(asFloat) ){
                                v = " " + roundCurrency( asFloat)
                            }
                        }else if( rowConfig.format === "number"){
                            const asFloat = parseFloat(v)
                            if( !isNaN(asFloat) ){
                                v = " " + formatNumber( asFloat)
                            }
                        }
                        return v
                    }).join("|") + "|\n"
                    validRows += row.find(d=>d.value && d.value.trim() != "-" ) ? 1 : 0
                }else{
                    if( cols ){
                        out += "|" + cols.map(c=>"-").join("|") + "|\n"
                    }
                }
            }
        }
        if( validRows ){
            if(tables > 0){
                overall += "\n"
            }
            let title = sectionInfo.title ?? section
            overall += title + "\n" + "-".repeat(title.length) + "\n"
            overall += out
            tables ++ 
        }

    }
    return overall
}