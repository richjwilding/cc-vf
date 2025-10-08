import "./actions/finance_actions"
import "./actions/actionrunner_actions"
import "./actions/trustpilot_helper"
import "./actions/linkedin_activity"
import { registerAction } from "./action_helper"
import { getQueue } from "./queue_registry"


registerAction("integration_sync", undefined, async (primitive, action, options, req)=>{
    console.log(`GOT SYNC REQUEST`)

    const q = await getQueue("integration")
    await q.enqueueSync( primitive )

})
