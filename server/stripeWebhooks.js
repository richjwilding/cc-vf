// stripeWebhooks.js
import express from 'express';
import Stripe from 'stripe';
import bodyParser from 'body-parser'
import { getLogger } from './logger';
import User from './model/User';
import { extendCreditsForSubscription, findOrganizationForCreditAllocation } from './CreditHandling';
import Organization from './model/Organization';
import { getOrganizationsWithSubscription, getOrganizationWithSubscription } from './SharedFunctions';
import { SIO } from './socket';

const logger = getLogger('stripe_webhook', "info"); // Debug level for moduleA
var ObjectId = require('mongoose').Types.ObjectId;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// ⚠️ Use raw body parser *only* on the webhook route:
router.post(
  '/webhook',
  bodyParser.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    let orgId, sendUpdate = false
    const stripeData = event.data.object
    const stripeCustomerId = stripeData.customer

    switch (event.type) {
        case 'checkout.session.completed':
            try{
                orgId = stripeData.client_reference_id
                await Organization.updateOne({
                    _id: orgId,
                    $set: {
                        "billing.stripe.customerId": stripeCustomerId,
                        "billing.stripe.subscriptionId": stripeData.subscription
                    },
                    $push: {"billing.stripe.events": {id: stripeData.id, type: event.type, info: JSON.stringify(stripeCustomerId)}}
                })
            }catch(err){
                logger.error(`Error associating stripe customer with user`, err)
            }
            break;
        case 'customer.subscription.created':
            try{
                orgId = stripeData.metadata?.orgId
                
                const org = await getOrganizationWithSubscription( orgId )
                const internalPlanId = org.validPlans.find(d=>d.stripe?.priceId === stripeData.plan.id)?._id
                if( internalPlanId ){

                    
                    await Organization.updateOne({
                        _id: orgId,
                        $set: {
                            "billing.stripe.customerId": stripeCustomerId,
                            "billing.stripe.subscriptionId": stripeData.id,
                            "billing.stripe.planId": stripeData.plan.id,
                            "activePlanId": new ObjectId(internalPlanId)
                        },
                        $push: {"billing.stripe.events": {id: stripeData.id, type: event.type, info: JSON.stringify(stripeData.plan)}}
                    })
                }else{
                    throw `Couldnt find plan with id ${stripeData.plan.id} for ${org.id}`
                }
                sendUpdate = true
            }catch(err){
                logger.error(`Error creating subscription`, err)
            }
            break;
        case 'invoice.paid':
            try{
                orgId = stripeData.subscription_details?.metadata?.orgId
                const org = await Organization.findOneAndUpdate({
                    _id: orgId,
                    $push: {"billing.stripe.events": {id: stripeData.id, type: event.type, info: {invoiceUrl: stripeData.hosted_invoice_url, invoicePdfUrl: stripeData.invoice_pdfa, amount_due: stripeData.amount_due, amount_paid: stripeData.amount_paid}}}
                })
                if( org ){
                    await extendCreditsForSubscription( org )
                }
                sendUpdate = true
            }catch(err){
                logger.error(`Error handling ${event.type}`, err)
            }

            break
        case 'invoice.payment_failed':
            try{
                orgId = stripeData.subscription_details?.metadata?.orgId
                await Organization.updateOne({
                    _id: orgId,
                    $push: {"billing.stripe.events": {id: stripeData.id, type: event.type, info: {invoiceUrl: stripeData.hosted_invoice_url, invoicePdfUrl: stripeData.invoice_pdfa, amount_due: stripeData.amount_due, amount_paid: stripeData.amount_paid}}}
                })
            }catch(err){
                logger.error(`Error handling ${event.type}`, err)
            }

            break
        case "customer.subscription.updated":
              try{
                orgId = stripeData.metadata?.orgId
                const hasBeenCancelled = stripeData.cancel_at  || stripeData.cancel_at_period_end
                if( hasBeenCancelled ){
                    await Organization.updateOne({
                        _id: orgId,
                        $set:{
                            "billing.stripe.sub_timestamp": stripeData.created,
                            "billing.stripe.cancel_at": stripeData.cancel_at,
                            "billing.stripe.cancel_at_period_end": stripeData.cancel_at_period_end,
                            "billing.stripe.canceled_at": stripeData.canceled_at
                        },
                        $push: {"billing.stripe.events": {id: stripeData.id, type: event.type, info: {cancelled: true, cancel_at: stripeData.cancel_at, cancel_at_period_end: stripeData.cancel_at_period_end, canceled_at: stripeData.cancel_at, cancellation_details: stripeData.cancellation_details, plan: stripeData.plan.id}}}
                    })
                }else{
                    const org = await getOrganizationWithSubscription( orgId )
                    const internalPlanId = org.validPlans.find(d=>d.stripe?.priceId === stripeData.plan.id)?._id

                    if( internalPlanId ){
                        await Organization.updateOne({
                            _id: orgId,
                            $set:{
                                "billing.stripe.sub_timestamp": stripeData.created,
                                "billing.stripe.planId": stripeData.plan.id,
                                "activePlanId": new ObjectId(internalPlanId)
                            },
                            $unset:{
                                "billing.stripe.cancel_at": true,
                                "billing.stripe.cancel_at_period_end": true,
                                "billing.stripe.canceled_at": true
                            },
                            $push: {"billing.stripe.events": {id: stripeData.id, type: event.type, info: {cancelled: false, plan: stripeData.plan.id}}}
                        })
                    }else{
                        throw `Couldnt find plan with id ${stripeData.plan.id} for ${org.id}`
                    }
                }
                sendUpdate = true
            }catch(err){
                logger.error(`Error handling ${event.type}`, err)
            }

            break

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    if( orgId ){
        try{
            const updatedOrg = await getOrganizationWithSubscription( orgId )
            const usersToNotify = updatedOrg.members.map(d=>d.userId)
            await SIO.notifyUsers( usersToNotify, [
                {
                    type: "organization_update",
                    id: updatedOrg.id,
                    data: updatedOrg
                }
            ])
        }catch(e){
            logger.error(`Error sending notification`, err)
        }
    }

    res.json({ received: true });
  }
);

export default router;