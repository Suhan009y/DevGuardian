# NexEncode Demo Payment Guide

The Razorpay flow has been removed from this build. Premium checkout is now simulated locally for project presentation.

## Supported methods

- Credit Card
- Debit Card
- UPI
- Net Banking
- Wallet

## Test values

### Card

- Number: `4111 1111 1111 1111`
- Name: any demo name
- Expiry: `12/30`
- CVV: `123`

### UPI

- UPI ID: `user@upi`

### OTP

- Demo OTP: `123456`

## Environment settings

```env
PREMIUM_PRICE_INR=199
DEMO_PAYMENT_ENABLED=true
DEMO_PAYMENT_OTP=123456
DEMO_PREMIUM_DAYS=30
```

## What happens after success

1. A demo subscription record is created.
2. The user is upgraded to Premium.
3. Premium remains active for the configured number of days.
4. A payment record is added.
5. An invoice number and PDF invoice are generated.
6. The admin revenue and subscription reports include the demo payment.
7. The user receives a Premium activation notification.

## Safety

This checkout must be presented as a simulation. It does not send or store card numbers, CVV, UPI PINs, internet-banking credentials, or wallet passwords. Do not ask users to enter real payment information.
