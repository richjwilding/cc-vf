import { registerAction } from "../action_helper";
import { createPrimitive, dispatchControlUpdate } from "../SharedFunctions";
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
import "../entity_resources/crunchbase";

const actionLogger = getLogger("entity_resource_actions", "debug");
const TARGET_KEYS = ["annual_report", "trustpilot", "owler", "linkedin", "crunchbase"];
const REFERENCE_FIELD_BY_TARGET = {
    trustpilot: "trustpilot",
    owler: "owler",
    linkedin: "linkedIn",
    crunchbase: "crunchbase"
};

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
        const statusField = `processing.agent.${actionKey}`;
        const startedAt = new Date().toISOString();
        const baseStatus = {
            action: actionKey,
            startedAt
        };
        const updateStatus = async (overrides = {}) => {
            const payload = {
                ...baseStatus,
                ...overrides,
                updatedAt: new Date().toISOString()
            };
            try {
                await dispatchControlUpdate(
                    primitive.id,
                    statusField,
                    payload,
                    { track: primitive.id }
                );
            } catch (err) {
                actionLogger.debug(`Failed to update status for ${actionKey}`, { error: err?.message });
            }
        };
        await updateStatus({ status: "running", message: "Preparing lookup" });

        const metadata = extractCompanyMetadata(primitive, options);
        const companyContext = deriveCompanyContext(primitive, options, metadata);

        if (requireIdentifiers && !companyContext.companyDomain && !metadata.companyName && !metadata.companyDescription) {
            actionLogger.warn(`${actionKey} missing primary company identifiers`, { primitiveId: primitive?.id, options });
            await updateStatus({
                status: "error",
                message: "Company name or domain is required"
            });
            return { success: false, error: "Company name or domain is required" };
        }

        const preparedOptions = definition.prepareOptions ? definition.prepareOptions(options) : options;
        const statusCallback = async (message, details) => {
            await updateStatus({
                status: "running",
                message,
                details
            });
        };

        let result;
        try {
            await updateStatus({ status: "running", message: "Running lookup" });
            result = await executeEntityResourceTarget(targetKey, {
                primitive,
                action,
                req,
                metadata,
                companyContext,
                options: preparedOptions,
                rawOptions: options,
                statusCallback
            });
        } catch (error) {
            actionLogger.error(`${actionKey} execution failed`, { error: error?.message, stack: error?.stack });
            await updateStatus({
                status: "error",
                message: error?.message ?? "Entity resource lookup failed"
            });
            return { success: false, error: error?.message ?? "Entity resource lookup failed" };
        }

        const candidateCount = Array.isArray(result?.candidates) ? result.candidates.length : 0;
        const wasSuccessful = result?.success === true;
        const errorMessage = result?.error;
        await updateStatus({
            status: wasSuccessful ? "complete" : (errorMessage ? "error" : "complete"),
            message: wasSuccessful
                ? (candidateCount > 0
                    ? `Found ${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`
                    : "Lookup completed with no matches")
                : (errorMessage ?? "Lookup completed with no matches"),
            candidateCount
        });

        if (result?.success && Array.isArray(result.candidates) && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            const refField = REFERENCE_FIELD_BY_TARGET[targetKey];
            if (refField && candidate?.url) {
                const normalizedUrl = typeof candidate.url === "string" ? candidate.url.trim() : candidate.url;
                if (normalizedUrl) {
                    try {
                        await dispatchControlUpdate(
                            primitive.id,
                            `referenceParameters.${refField}`,
                            normalizedUrl,
                            { track: primitive.id }
                        );
                    } catch (error) {
                        actionLogger.warn(`Failed to update reference parameter for ${actionKey}`, { error: error?.message });
                    }
                }
            }

            if (definition.resultReferenceId && primitive?.workspaceId && primitive?.id && candidate?.url) {
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
