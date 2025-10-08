import { registerAction } from "../action_helper";
import { fetchPrimitive } from "../SharedFunctions";

const LINKEDIN_HOST_PATTERN = /(^|\.)linkedin\.com$/i;

function normalizeLinkedInUrl(raw) {
    if (typeof raw !== "string") {
        return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        if (!LINKEDIN_HOST_PATTERN.test(url.hostname)) {
            return undefined;
        }
        url.hash = "";
        url.search = "";
        return url.toString();
    } catch (error) {
        console.warn(`Unable to parse LinkedIn url '${raw}': ${error.message}`);
        return undefined;
    }
}

async function resolveTargetPrimitive(primitive, options = {}) {
    const targetId = options.targetPrimitiveId || options.targetId;
    if (!targetId || targetId === primitive.id) {
        return primitive;
    }

    const fetched = await fetchPrimitive(targetId);
    if (!fetched) {
        console.warn(`LinkedIn activity action could not resolve target primitive ${targetId}`);
        return primitive;
    }
    return fetched;
}

let cachedTriggerBrightDataCollection;

async function getTriggerBrightDataCollection() {
    if (!cachedTriggerBrightDataCollection) {
        const { triggerBrightDataCollection } = await import("../brightdata.js");
        cachedTriggerBrightDataCollection = triggerBrightDataCollection;
    }
    return cachedTriggerBrightDataCollection;
}

registerAction("collect_linkedin_activity", { id: 58, type: "categoryId" }, async (primitive, action, options = {}) => {
    const targetPrimitive = await resolveTargetPrimitive(primitive, options);
    const activity = targetPrimitive?.referenceParameters?.activity;

    if (!Array.isArray(activity) || activity.length === 0) {
        console.log(`LinkedIn activity action found no activity entries for ${targetPrimitive?.id}`);
        return { scheduled: false, reason: "no_activity" };
    }
    const n = targetPrimitive?.referenceParameters?.profile?.split("/").at(-1)
    const limit = options.limit_count || options.limit || 100

    const urls = Array.from(
        new Set(
            activity
                .filter(d=>d.action?.toLowerCase().includes("shared") || d.activity_url.includes(n))
                .map((entry) => entry?.activity_url)
                .map(normalizeLinkedInUrl)
                .filter(d=>d.match(/.*linkedin\.com\/(pulse|posts|feed\/update)(\/\S*)?.*/))
                .filter(Boolean)
                .slice(0, limit)
        )
    );

    if (urls.length === 0) {
        console.log(`LinkedIn activity action found no LinkedIn urls for ${targetPrimitive?.id}`);
        return { scheduled: false, reason: "no_linkedin_urls" };
    }

    if (targetPrimitive?.bd?.linkedin_user_post?.collectionId && options.force !== true) {
        console.log(`LinkedIn activity action skipping schedule for ${targetPrimitive.id} (existing collection)`);
        return { scheduled: false, reason: "existing_collection" };
    }

    const input = urls.map((url) => ({ url }));
    const triggerBrightDataCollection = await getTriggerBrightDataCollection();
    await triggerBrightDataCollection(input, "linkedin_user_post_direct", targetPrimitive, urls.join(","));

    return { scheduled: true, urlCount: urls.length, targetId: targetPrimitive.id };
});
