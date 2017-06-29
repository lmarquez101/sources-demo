'use strict';

const firebase = require('firebase');

const app = firebase.initializeApp({
    // your firebase credentials
  });

module.exports = {
  retrieveOrder: async function(orderId) {
    let snapshot = await firebase.database().ref('/orders/' + orderId).once('value');
    return snapshot.val();
  },
  getOrderBySourceId: async function(sourceId) {
    return new Promise((resolve, reject) => {
        firebase.database()
        .ref('/orders')
        .orderByChild('sourceId')
        .equalTo(sourceId)
        .on('value', function(snapshot) {
            let orders = snapshot.val();
            if(orders) {
                orders = Object.keys(orders).map(key => orders[key]);
            }
            if (!orders || orders.length === 1) {
              resolve(orders ? orders[0] : null);
            } else {
              reject({ error: 'More than one order found for this source.' });
            }
        });
    });
  },
  getOrdersBySourceId: async function(sourceId) {
    return new Promise((resolve, reject) => {
        firebase.database()
        .ref('/orders')
        .orderByChild('sourceId')
        .equalTo(sourceId)
        .on('value', function(snapshot) {
            let orders = snapshot.val();
            if(orders) {
                orders = Object.keys(orders).map(key => orders[key]);
            }
            resolve(orders);
        });
    });
  },
  updateOrderStatus: async function(orderId, status) {
    try {
      await firebase.database().ref('/orders/' + orderId + '/status').set(status);
      return {};
    } catch (err) {
      return err;
    }
  },
  createOrder: async function(source=null, currency='eur', amount=100, orderId=null, status='new')   {
    let orders = {};
    orderId = orderId ? orderId : firebase.database().ref().child('orders').push().key;
    currency = (source.currency && currency != source.currency) ? source.currency : currency;
    let defaultOrder = {
        id: orderId,
        amount,
        currency,
        status,
        source,
        sourceId: source.id,
    };
    orders[orderId] = defaultOrder;
    try {
      await firebase.database().ref().child('orders').update(orders);
      return orders[orderId];
    } catch (err) {
      return err;
    }
  },
};
