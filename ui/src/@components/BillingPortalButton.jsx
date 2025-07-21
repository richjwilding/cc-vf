import { Button } from '@heroui/react';
import { Icon } from '@iconify/react/dist/iconify.js';
import { useState } from 'react';

export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    setLoading(true);
    const res = await fetch('/stripe/portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'    // so your auth cookie goes through
    });
    const { url, error } = await res.json();
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    window.location.assign(url);
  };

  return (
    <Button onPress={openPortal} isDisabled={loading} variant="ghost" startContent={<Icon icon="fa-brands:cc-stripe" className="w-6 h-6"/>}>
                                                                                        Manage billing on Stripe
                                                                                    </Button>
  );
}