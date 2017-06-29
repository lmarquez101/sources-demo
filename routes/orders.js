const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const stripe = require('stripe')(process.env.STRIPE_SECRET_TEST_KEY);
const db = require('../helpers/firebase-db');

// Helper functions
// TODO move into own module
function trigger3DS(order) {
  // TODO some dynamic logic
  return (order.source.card.three_d_secure === 'required');
}

router.post('/create', jsonParser, async (req, res) => {
  const reqData = req.body;
  // Create order in your DB
  // TODO create/add customer for each order
  let order = await db.createOrder(reqData.source)
  // Check if 3DS is needed
  if (order.source.type === 'card' && trigger3DS(order)) {
    /* We need to do 3D-Secure -> create 3DS source
    Note: You can also create the 3D-Secure source client-side, see
    https://stripe.com/docs/sources/three-d-secure#client-side-source-creation
    So alternatively you can send the evaluation info back to your client
    for source creation. */
    let threeDSecureSource = await stripe.sources.create({
      amount: order.amount,
      currency: order.currency,
      type: 'three_d_secure',
      three_d_secure: {
        card: order.source.id,
      },
      redirect: {
        return_url: req.headers.origin,
      },
    });
    // update order with new source
    let updatedOrder = await db.createOrder(
      threeDSecureSource, order.currency, order.amount, order.id
    );
    res.json(updatedOrder);

  } else if (order.source.status === 'chargeable') {
    // Source is chargeable, let's charge it right away
    try {
      let charge = await stripe.charges.create({
        amount: order.amount,
        currency: order.currency,
        source: order.source.id,
        description: `Charge for order #${order.id}`,
        metadata: { order: order.id },
      }, {
        // Set unique idempotency key of order ID - source ID
        // This is to avoid race conditions with your webhook handler.
        idempotency_key: `${order.id}-${order.source.id}`
      });
      // Update order status to reflect charge status
      await db.updateOrderStatus(order.id, charge.status);
      order.status = charge.status;
      res.json(order);
    } catch (err) {
      // TODO pass on decline code logic
      await db.updateOrderStatus(order.id, 'failed');
      order.status = 'failed';
      order.error = err;
      res.json(order);
    }
  } else {
    // Source is not chargeable -> return for source activation
    res.json(order);
  }
});

module.exports = router;
