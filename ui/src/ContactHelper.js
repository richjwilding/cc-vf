import MainStore from "./MainStore"
export default function ContactHelper(primitive){
    let obj ={
        enrichForInteraction:async function( primitive, options = {} ){
            const contact = primitive.referenceParameters.contact
            const company = primitive.referenceParameters.company
            options.company = company

            return await this.enrichContact( contact, options)
        },
        enrichContact:async function( contact, options ={} ){
            if( contact === undefined ){
                console.warn("No contact given")
                return
            }

            const {force = false } = options
            console.log(options)
            if( contact.avatarUrl  && !force ){
                return
            }
            if( contact.profile || options.company ){

                const result = await fetch("/api/enrichContact?" + 
                    new URLSearchParams({
                        contactId: contact.id,
                        company: options.company
                    })
                ,{
                    method: "GET",
                })
                const response = await result.json()
                console.log(response)
            }
        }
        
    }
    return obj
}