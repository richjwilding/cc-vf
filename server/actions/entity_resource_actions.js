import { registerAction } from "../action_helper";
import { createPrimitive } from "../SharedFunctions";
import { getLogger } from "../logger";
import {
    extractCompanyMetadata,
    deriveCompanyContext,
    executeEntityResourceTarget,
    getEntityResourceTarget,
} from "../entity_resource_capability";

import "../entity_resources/annual_report";
import "../entity_resources/trustpilot";
import "../entity_resources/owler";
import "../entity_resources/linkedin";

const actionLogger = getLogger("entity_resource_actions", "debug");
const TARGET_KEYS = ["annual_report", "trustpilot", "owler", "linkedin"];

for (const targetKey of TARGET_KEYS) {
    const definition = getEntityResourceTarget(targetKey);
    if (!definition) {
        actionLogger.warn(`No entity resource definition found for ${targetKey}`);
        continue;
    }
    const actionKey = definition.actionKey ?? targetKey;
    const mappings = definition.categoryId ? { type: "categoryId", id: definition.categoryId } : undefined;
    const requireIdentifiers = definition.requireCompanyIdentifier !== false;

    registerAction(actionKey, mappings, async (primitive, action, options = {}, req) => {
        const metadata = extractCompanyMetadata(primitive, options);
        const companyContext = deriveCompanyContext(primitive, options, metadata);

        if (requireIdentifiers && !companyContext.companyDomain && !metadata.companyName && !metadata.companyDescription) {
            actionLogger.warn(`${actionKey} missing primary company identifiers`, { primitiveId: primitive?.id, options });
            return { success: false, error: "Company name or domain is required" };
        }

        const preparedOptions = definition.prepareOptions ? definition.prepareOptions(options) : options;

        let result;
        try {
            result = await executeEntityResourceTarget(targetKey, {
                primitive,
                action,
                req,
                metadata,
                companyContext,
                options: preparedOptions,
                rawOptions: options
            });
        } catch (error) {
            actionLogger.error(`${actionKey} execution failed`, { error: error?.message, stack: error?.stack });
            return { success: false, error: error?.message ?? "Entity resource lookup failed" };
        }

        if (result?.success && definition.resultReferenceId && Array.isArray(result.candidates) && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate?.url && primitive?.workspaceId && primitive?.id) {
                const title = definition.buildResultTitle
                    ? definition.buildResultTitle({ metadata, companyContext, candidate, primitive, result })
                    : `${metadata?.companyName ?? primitive?.title ?? "Entity result"} - ${actionKey}`;
                try {
                    await createPrimitive({
                        workspaceId: primitive.workspaceId,
                        parent: primitive.id,
                        paths: ["origin"],
                        data: {
                            type: "result",
                            referenceId: definition.resultReferenceId,
                            title,
                            referenceParameters: { url: candidate.url }
                        }
                    });
                } catch (error) {
                    actionLogger.warn(`${actionKey} result persistence failed`, { error: error?.message });
                }
            }
        }

        return result;
    });
}
