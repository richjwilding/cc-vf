// stripeCheckout.js
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { getLogger } from './logger';
import { findOrganizationForCreditAllocation } from './CreditHandling';
import SubscriptionPlan from './model/SubscriptionPlan';
dotenv.config();
const logger = getLogger('stripe_actions', "info"); // Debug level for moduleA

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.post('/subscribe', async (req, res) => {
  try {
    
    const internalUserId = req.user._id
    const org = await findOrganizationForCreditAllocation( internalUserId )
    if( !org ){
        throw `Couldnt find organization for user ${internalUserId}`
    }
    const priceId = req.body.priceId

    const existingSubscriptionId = org.billing?.stripe?.subscriptionId

    if( existingSubscriptionId ){
        if( org.billing.stripe.cancel_at && (org.billing.stripe.cancel_at * 1000 > Date.now())){
            logger.info(`Resubscribing cancelled subscription`)

            await stripe.subscriptions.update(existingSubscriptionId, {
                cancel_at_period_end: false
            });

        }else{
            logger.info(`Changing active subscription`)
            const subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
            const itemId = subscription.items.data[0].id; // assume 1 item

            const plans = await SubscriptionPlan.find({$or:[
                {_id: [org.activePlanId?.toString()]},
                {"stripe.priceId": priceId}
            ]})
            const currentPlan = plans.find(d=>d.id === org.activePlanId.toString())
            const newPlan = plans.find(d=>d.id !== org.activePlanId.toString())
            if( !currentPlan || !newPlan ){
                throw "couldnt find price plans"
            }

            const upgrading = newPlan.price > currentPlan.price
            
            if( upgrading){
                logger.info(`Plan upgrade`)
                await stripe.subscriptions.update(existingSubscriptionId, {
                    items: [{
                        id: itemId,
                        price: priceId
                    }],
                   proration_behavior: 'none',        // 🔒 disables any credit
                    billing_cycle_anchor: 'now',       // ⏰ restart the month today
                    payment_behavior: 'pending_if_incomplete'
                });
            }else{
                logger.info(`Plan downgrade`)
                await stripe.subscriptions.update(existingSubscriptionId, {
                    items: [{
                        id: itemId,
                        price: priceId
                    }],
                    proration_behavior: 'none',
                    billing_cycle_anchor: 'unchanged'
                });

            }

            res.json({ subscription: "update_pending" });        
        }
    }else{
        logger.info(`Creating new subscription`)
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.FRONTEND_URL}/account`,
            cancel_url: `${process.env.FRONTEND_URL}/account`,
            payment_method_types: ['card'],
            client_reference_id: org.id,
            customer_email: req.body.customerEmail,
            subscription_data: {
                metadata: { 
                    orgId: org.id,
                    byUser: internalUserId
                }      // ← this metadata is copied to the Subscription
                //billing_mode: 'flexible',
            } ,
        });
        res.json({ sessionId: session.id });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'session creation failed' });
  }
});

router.post('/portal-session', async (req, res) => {
    const internalUserId = req.user._id
    const org = await findOrganizationForCreditAllocation( internalUserId )
    const customerId = org.billing?.stripe?.customerId;
    if (!customerId) {
        return res.status(400).json({ error: 'No Stripe customer ID on user' });
    }

    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.FRONTEND_URL}/account`,
        });
        res.json({ url: session.url });
    } catch (err) {
        console.error('Portal session error:', err);
        res.status(500).json({ error: 'Could not create portal session' });
    }
});


export default router;