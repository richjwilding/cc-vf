// stripeWebhooks.js
import express from 'express';
import Stripe from 'stripe';
import bodyParser from 'body-parser'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// ⚠️ Use raw body parser *only* on the webhook route:
router.post(
  '/webhook',
  bodyParser.raw({ type: 'application/json' }),
  (req, res) => {
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

    switch (event.type) {
      case 'checkout.session.completed':
        // TODO: mark user active, grant access, etc.
        console.log('✅ Subscription started:', event.data.object.id);
        break;
      case 'invoice.payment_failed':
        console.log('❌ Payment failed for', event.data.object.customer_email);
        break;
      // …other event types…
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
);

export default router;