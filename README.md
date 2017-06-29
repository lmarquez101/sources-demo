# Stripe Sources Demo
https://stripe-sources-demo.herokuapp.com/

## Installation & setup guide
### Requirements
node v7.8.0 (npm v4.2.0)
you can use [nvm](https://github.com/creationix/nvm#installation) and run `nvm use stable`
### Installation
* clone or download repository
* `cd sources-demo && npm install`
* add your test secret key as an env variable in your terminal session `export STRIPE_SECRET_TEST_KEY=sk_test_***`
* change the `TEST_PK` in `public/javascript/app.js` to your own
* add your firebase credentials in `index.html` and `helpers/firebase-db.js`
* add you webhook secret in `routes/webhooks.js`
* `DEBUG=sources-demo:* npm start`
### Setup webhooks
* in a separate terminal window run `ngrok http 3000`
* add ngrok forwarding URL as account test webhook in Stripe Dashboard: https://dashboard.stripe.com/account/webhooks
* Select all sources & charges events (note: in testmode it makes sense to disable the `charge.pending` event as it might arrive after the `charge.succeeded` event, therefore overriding the order status)
### Run
* testmode: http://localhost:3000/
* livemode: http://localhost:3000/?live (only creates live sources, does not create live payments. This is useful to see what the redirect pages look like in livemode.)
