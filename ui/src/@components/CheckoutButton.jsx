// CheckoutButton.jsx
import { loadStripe } from '@stripe/stripe-js';
import { useState } from 'react';
import { Button } from '@heroui/react'; // or your HeroUI button

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutButton({ priceId, email }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const res = await fetch('/stripe/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, customerEmail: email }),
    });
    const { sessionId } = await res.json();
    const stripe = await stripePromise;
    await stripe.redirectToCheckout({ sessionId });
    setLoading(false);
  };

  return (
    <Button onClick={handleClick} disabled={loading} className="mt-4">
      {loading ? 'Redirecting…' : 'Subscribe'}
    </Button>
  );
}