// stripeCheckout.js
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { findOrganizationForCreditAllocation } from './CreditHandling';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.post('/create-checkout-session', async (req, res) => {
  try {
    
    const internalUserId = req.user._id
    const org = await findOrganizationForCreditAllocation( internalUserId )
    if( !org ){
        throw `Couldnt find organization for user ${internalUserId}`
    }
    const priceId = req.body.priceId
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,
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