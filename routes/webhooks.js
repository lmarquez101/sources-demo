const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
// Retrieve the raw body as a buffer and match all content types
const rawParser = bodyParser.raw({type: '*/*'});
// TODO move keys to config module
const stripe = require('stripe')(process.env.STRIPE_SECRET_TEST_KEY);
const db = require('../helpers/firebase-db');
// Webhook secret
const endpointSecret = 'YOUR_WEBHOOK_SECRET';

router.post('/', rawParser, async (req, res) => {
  try {
    // Verify the event through webhook signature
    let sig = req.headers["stripe-signature"];
    let event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    let eventObject = event.data.object;
    let objectType = eventObject.object;
    // Handle the different events
    // TODO split out in own modules
    switch (objectType) {
      case 'source':
        let source = eventObject;
        // Retrieve order from database by source ID
        let order = await db.getOrderBySourceId(source.id);
        // Check if an order was found
        // TODO check order status
        if (order) {
          if(source.status === 'chargeable') {
            try {
              // Use order and source information to create the charge
              // This demo has a unique mapping of source <> order
              // therefore only one item will be in the orders list
              const charge = await stripe.charges.create({
                amount: order.amount,
                currency: order.currency,
                source: source.id,
                description: `Charge for order #${order.id}`,
                metadata: { order: order.id },
              },
              {
                // If the source was chargeable right away it might have
                // already been charged outside of the webhook handler.
                // therefore use orderId-sourceId as idempotency key
                idempotency_key: `${order.id}-${order.source.id}`
              });
              await db.updateOrderStatus(order.id, charge.status);
              res.json(charge);
            } catch (err) {
              // TODO hand on decline codes
              res.json(err);
            }
          } else {
            await db.updateOrderStatus(order.id, source.status);
            res.json(source);
          }
        } else {
          res.json({
            error: 'No order found',
            source: source.id,
          });
        }
        break;
      case 'charge':
        let charge = eventObject;
        orderId = charge.metadata.order;
        await db.updateOrderStatus(orderId, charge.status);
        res.json({order: orderId});
        break;
      default:
      res.send(200);
    }

  } catch (err) {
    console.log(err);
    res.json(err);
  }
});

module.exports = router;
