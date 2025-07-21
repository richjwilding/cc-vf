// CheckoutButton.jsx
import { loadStripe } from '@stripe/stripe-js';
import { useState } from 'react';
import { Button } from '@heroui/react'; // or your HeroUI button

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutButton({ priceId, isDisabled, ...props }) {
  const [loading, setLoading] = useState(false);


  const handleClick = async () => {
    setLoading(true);
    const res = await fetch('/stripe/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    const { sessionId } = await res.json();
    const stripe = await stripePromise;
    await stripe.redirectToCheckout({ sessionId });
    setLoading(false);
  };

  return (
    <Button onPress={handleClick} isDisabled={ loading || isDisabled} className="mt-4" {...props}>
      {loading ? 'Redirecting…' : 'Subscribe'}
    </Button>
  );
}