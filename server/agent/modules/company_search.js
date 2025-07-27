import { findCompanyURLByNameLogoDev } from "../../task_processor"
import { getLogger } from "../../logger";

const logger = getLogger('agent_module_company_search', "debug", 2); // Debug level for moduleA

export async function implementation(params, scope, notify){
    notify(`Looking for ${params.company_name ?? ""}...`,true)
    let data = await findCompanyURLByNameLogoDev(params.company_name, {withDescriptions: true})

    if( data.length > 0){
        data = data.map(d=>({
            name: d.name,
            domain: d.domain,
            description: d.description
        }))
        const result = `Looking for: ${params.company_name}\nContext: ${params.description}\n\nHere are some candidate(s), use the information provided and chat context to select the correct company\n${JSON.stringify(data)}`
        logger.debug(result, {chatId: scope.chatUUID})
        return result
    }
    return {"result": `Couldnt find information about ${params.name}`}
}
export const definition = {
        "name": "company_search",
        "description": "Search for a company given its name and a brief description of the company or industry, and return the company’s website URL.",
        "parameters": {
          "type": "object",
          "properties": {
            "company_name": {
              "type": "string",
              "description": "The official name of the company to search for."
            },
            "description": {
              "type": "string",
              "description": "A short description of the company or the industry in which it operates."
            }
          },
          "required": ["company_name", "description"]
        }
      }