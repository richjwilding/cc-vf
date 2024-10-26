export function fieldListToPromptOutput( list ){
    function unpackList(list){

    }

}

export function reviseUserRequest( request ){

    const prompt = `I am preparing a task to send to an ai, i don't want you to answer it - instead i want you to define a json structure for the output based on this request honouring any format that is specified. 
                    Each leaf in the proposed structure must have the following format {heading: a short heading that can be used when formatting the response, content: the description of what will be placed in the field by the AI, type: what format the content should be (one of list, string, number, boolean)} 
                    Focus only on the core output requested by the tasks.
                    Here is the task:`


    let outputText = `{"structure":[
    {
      "heading": "Baked goods spoiler organisms",
      "content": "A 300 word summary detailing the issues that spoiler organisms post in the baked goods sector and what measures are being taken to combat them.",
        "type": "markdown formatted string - **bold** _underline is perimitted",
      "ids": "List the numbers associated with the fragments of text used for this summary."
    },
    {
      "heading": "Spoiler organisms by category",
      "subsections": [
        {
          "heading": "Spoiler Organisms Impact Table",
          "content": "A table showing subsegment names in one column and the full set of spoiler organisms as a comma-separated list in the second column. Mark cells with a ^ character where own knowledge was used.",
          "type": "markdown formmated table",
          "ids": "List the numbers associated with the fragments of text used for the table."
        },
        {
          "content": "A 100 word summary following the table that encapsulates the data presented.",
          "type": "markdown formatted string - **bold** _underline is perimitted",
          "ids": "List the numbers associated with the fragments of text used for the summary."
        }
      ]
    },
    {
      "heading": "Spoiler organisms by region",
      "subsections": [
        {
          "heading": "Regional Spoiler Organisms Analysis Table",
          "content": "A detailed analysis table with regions as columns and spoiler organisms as rows. Each cell contains a tick if the spoiler organism is prevalent in that region; blank if not. Include a column for climate/environmental drivers. Mark cells with a ^ character where own knowledge was used.",
          "type": "markdown formmated table",
          "ids": "List the numbers associated with the fragments of text used for the table."
        },
        {
          "content": "A 100 word summary following the table that encapsulates the data presented.",
          "type": "markdown formatted string - **bold** _underline is perimitted",
          "ids": "List the numbers associated with the fragments of text used for the summary."
        }
      ]
    }
]}`

    const fStruct = JSON.parse(outputText)
    const oStruct = JSON.parse(outputText)
    function removeHeading(obj) {
        // Check if the object has a 'heading' key and delete it
        if (obj.hasOwnProperty('heading')) {
          delete obj.heading;
        }
      
        // Loop through each key-value pair in the object
        for (let key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (Array.isArray(obj[key])) {
              // If the value is an array, loop through its items
              obj[key].forEach(item => {
                if (typeof item === 'object') {
                  removeHeading(item);
                }
              });
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              // If the value is an object, recurse into it
              removeHeading(obj[key]);
            }
          }
        }
      }
      removeHeading(oStruct)
      let output = JSON.stringify(oStruct)

    console.log(output)

    return {task: `
            Act like an expert McKinsey market analysis and produce me a summary of the spoiler organisms in the Baking market. You must be detailed and specific, avoid filler and never use sales / marketing language.

            I am interested in the following subsegments: Cakes, Bread, Flatbreads and Tortilla, Steamed buns, English Muffins / Crumpets.

            And i have a specific interest in understanding facts, figures and trends at both regional levels covering APAC, North America, LATAM, Europe, MEA

            The report is for an enzyme producer who is interesting selling to bakers and baked goods manufacturers. They have a potential new natural product which enhances the clean label status of items.

            Analyze the text to identify all of the spoiler organisms which are relevant to the baked goos market. Be exhaustive and ensure you include all relevant spoiler organisms noted in the text i provided is taken into consideration.

            Mark any data points where you had to use your own knowledge rather than the information i gave you with a ^ character`,
            structure: fStruct.structure,
            output:JSON.stringify(output)
    }

}