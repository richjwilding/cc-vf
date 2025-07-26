// CheckoutButton.jsx
import { loadStripe } from '@stripe/stripe-js/pure';
import { useState } from 'react';
import { Button } from '@heroui/react'; // or your HeroUI button

loadStripe.setLoadParameters({advancedFraudSignals: false});
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutButton({ priceId, isDisabled, ...props }) {
  const [loading, setLoading] = useState(false);


  const handleClick = async () => {
    setLoading(true);
    const res = await fetch('/stripe/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    const { sessionId, subscription } = await res.json();
    if( sessionId ){
        const stripe = await stripePromise;
        await stripe.redirectToCheckout({ sessionId });
    }else{
        console.log(`UPDATED PLAN REQUEST SENT`)
    }
    setLoading(false);
  };

  return (
    <Button onPress={handleClick} isDisabled={ loading || isDisabled} className="mt-4" {...props}>
      {loading ? 'Updating…' : 'Subscribe'}
    </Button>
  );
}