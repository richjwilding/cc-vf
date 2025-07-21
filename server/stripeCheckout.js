// stripeCheckout.js
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: req.body.priceId, quantity: 1 }],
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,
        payment_method_types: ['card'],
        customer_email: req.body.customerEmail,
        priceId: process.env.STRIPE_PRICEID_STARTER,
        subscription_data: {
            billing_mode: 'flexible',
        },
    });
    res.json({ sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'session creation failed' });
  }
});

export default router;