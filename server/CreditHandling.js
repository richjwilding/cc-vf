import { getLogger } from "./logger";
import Organization from "./model/Organization"
const logger = getLogger('credit_handling', "info"); // Debug level for moduleA

export async function findOrganizationForWorkflowAllocation( flowInstance, {userInstantiated, ...details} ){
    userInstantiated ||= flowInstance.processing?.flow?.instantiatedBy
    const instantiatedForOrganizationId = flowInstance.processing?.flow?.instantiatedForOrganizationId
    if( !userInstantiated ){
        logger.info(`Flowinstance ${flowInstance.id} doesnt have any instaniation data`)
        return undefined
    }
    return findOrganizationForCreditAllocation( userInstantiated, instantiatedForOrganizationId )
}
export async function findOrganizationForCreditAllocation( userId, organizationId ){

    const orgs = await Organization.find({ members: { $elemMatch: { user: userId, role: 'owner' } }})
    let chargeToOrg = organizationId ? orgs.find(d=>d._id.toString() === organizationId)  : undefined
    if( organizationId && !chargeToOrg){
        logger.info(`User doesnt belong to org ${organizationId} that this flow was instantiated for (is a member of ${orgs.map(d=>d.id).join(", ")})`)
    }
    if( !chargeToOrg ){
        chargeToOrg = orgs[0]
        if( orgs.length > 1){
            logger.info(`User belongs to multiple organizations - allocating to ${chargeToOrg.id}`)
        }
    }
    if( !chargeToOrg ){
        logger.error(`Couldnt allocate for for user ${userId} - couldnt find org`)
    }
    return chargeToOrg
}
export async function extendCreditsForSubscription( organization, credits ){
    credits = credits ?? organization.plan?.creditsPerPeriod ?? 0
    await recordCreditUsageEvent( organization, {delta: credits, message: `Subscription - ${credits}`})

}

export async function recordCreditUsageEvent( organization, {userId, targetId, delta, message}){
     const now = new Date().toISOString();

    await Organization.updateOne(
        { _id: organization.id },
        [
            {
                $set: {
                    credits: { $add: ["$credits", delta] }
                }
            },
            {
                $set: {
                usage: {
                    $concatArrays: [
                    "$usage",
                    [
                        {
                            timestamp: now,
                            userId,
                            targetId,
                            delta,
                            message,
                            post: "$credits"     // <-- now refers to the updated field
                        }
                    ]
                    ]
                }
                }
            }
        ]   
    )
}