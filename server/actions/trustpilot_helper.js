import { dispatchControlUpdate } from "../SharedFunctions";
import { registerAction } from "../action_helper";
import { findEntityResourceCandidates, findEntityResourceUrl } from "../entity_resource_capability";

registerAction("find_trustpilot_url", { type: "categoryId", id: 29 }, async (primitive, action, options = {}, req) => {
    try {
        const result = await findEntityResourceCandidates("trustpilot", { primitive, options });
        const candidate = Array.isArray(result?.candidates) ? result.candidates[0] : undefined;
        if (candidate?.url) {
            await dispatchControlUpdate(primitive.id, "referenceParameters.trustpilot", candidate.url);
        }
        return result ?? { success: false };
    } catch (error) {
        return { success: false, error: error?.message ?? "trustpilot lookup failed" };
    }
});

export async function findTrustPilotURLFromDetails({ title, description, url, workspaceId }) {
    const referenceParameters = {};
    if (typeof description === "string" && description.trim().length > 0) {
        referenceParameters.description = description;
    }
    if (typeof url === "string" && url.trim().length > 0) {
        referenceParameters.url = url;
    }

    const primitive = {
        type: "entity",
        title: title ?? undefined,
        workspaceId,
        referenceParameters
    };

    const options = {
        companyName: title,
        companyDescription: description,
        companyUrl: url
    };

    try {
        return await findEntityResourceUrl("trustpilot", { primitive, options });
    } catch (error) {
        return undefined;
    }
}
