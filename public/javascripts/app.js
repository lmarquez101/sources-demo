var TEST_PK = 'YOUR_TEST_PUBLISHABLE_KEY';
var LIVE_PK = 'YOUR_LIVE_PUBLISHABLE_KEY';

// Execute this when DOM is loaded
$(document).ready(function() {
  var STRIPE_PK = (window.location.search.indexOf('?live') != -1) ? LIVE_PK : TEST_PK;
  // Config Stripe.js V3
  stripe = Stripe(STRIPE_PK);
  elements = stripe.elements();
  card = elements.create('card', {
    style: {
      base: {
        iconColor: '#666EE8',
        color: '#31325F',
        lineHeight: '40px',
        fontWeight: 300,
        fontFamily: 'Helvetica Neue',
        fontSize: '15px',

        '::placeholder': {
          color: '#CFD7E0',
        },
      },
    },
    hidePostalCode: true,
  });
  card.mount('#card-element');
  card.on('change', function(event) {
    setOutcome(event);
  });
  // Submit buttons event listener
  Array.from(document.getElementsByClassName("paymentButton")).forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      createSource(button.id);
    });
  });

  // Config Checkout
  var handler = StripeCheckout.configure({
    key: stripe._apiKey,
    image: 'https://stripe.com/img/documentation/checkout/marketplace.png',
    locale: 'auto',
    token: function(result) {
      // For bitcoin result will be a source, for cards result will be a token
      // Therefore we need to handle the different cases
      // Note support for card sources is planned for July
      switch (result.object) {
        case "token":
          // It's a token, we need to turn it into a source
          stripe.createSource({
            type: 'card',
            token: result.id,
          }).then(setOutcome);
          break;
        case "source":
          // It's a source. We can hand it to setOutcome
          setOutcome({ source: result });
          break;
        default:
          console.log(`Unexpected object type: ${result.object}`);
      }
    }
  });
  // Checkout button event listener
  document.getElementById('checkoutButton').addEventListener('click', function(e) {
    // Open Checkout with further options:
    handler.open({
      bitcoin: true,
      name: 'schaeffonline.de',
      description: '2 widgets',
      zipCode: false,
      currency: 'usd',
      amount: 100,
    });
    e.preventDefault();
  });
  // Close Checkout on page navigation:
  window.addEventListener('popstate', function() {
    handler.close();
  });

  // Get source params after redirect
  var sourceId = getQueryParam('source');
  // If source ID is set - handle redirect return
  if (sourceId) {
    handleRedirectReturn(sourceId);
  }
});

// Create source: https://stripe.com/docs/sources
function createSource(sourceType) {
  // Put together the details needed to create the payment source
  var sourceDetails = {
    owner: getOwnerDetails(),
  };
  // Add payment method specific information
  if (sourceType === "card") {
    // Card source needs to be created from a card Element to ensure PCI compliance
    stripe.createSource(card, sourceDetails).then(setOutcome);
  } else {
    // Handle common inputs that are shared across some payment methods
    switch (sourceType) {
      case "bancontact":
      case "giropay":
      case "ideal":
      case "sofort":
      case "alipay":
        // These redirect flow payment methods need this information to be set at source creation
        sourceDetails.amount = 100;
        sourceDetails.currency = "eur";
        sourceDetails[sourceType] = { statement_descriptor: "Stripe Payments Test" };
        sourceDetails.redirect = { return_url: window.location.origin };
        break;
    }
    // Handle special inputs that are unique to a payment method
    switch (sourceType) {
      case "sepa_debit":
        sourceDetails.currency = "eur";
        sourceDetails.sepa_debit = { iban: $("#IBAN").val() };
        break;
      case "ideal":
        sourceDetails.ideal = { bank: $("#ideal_bank").val() };
        break;
      case "sofort":
        sourceDetails.sofort = { country: $("#sofort_country").val() };
        break;
      case "bitcoin":
      case "alipay":
        sourceDetails.currency = "usd";
        sourceDetails.amount = 100;
        break;
    }
    sourceDetails.type = sourceType;
    stripe.createSource(sourceDetails).then(setOutcome);
  }
}

function setOutcome(result) {
  if (result.source) {
    spinnerHandler("loading");
		// Process source further
	  stripeSourceHandler(result.source);

  } else if (result.error) {
    // Show error message
    spinnerHandler("error", result.error.message);
  } else {
    spinnerHandler();
  }
}

function stripeSourceHandler(source) {
	// Send source and order info to your server
 	axios.post('/orders/create', {
    source: source,
  })
  .then(function (response) {
    console.log(response.data);
    var order = response.data;
    // Listen for changes on my order status (polling through firebase)
    var orderRef = firebase.database().ref('orders/' + order.id + '/status');
    orderRef.on('value', function(snapshot) {
      // Handle order status update
      order.status = snapshot.val();
      if (order.status != 'new') { merchantOrderHandler(order, "update"); }
    });
    merchantOrderHandler(order, "create");
  })
  .catch(function (error) {
    console.log(error);
  });
}

function merchantOrderHandler(order, context) {
  if (context === 'create') {
    // This is a new order - the source needs activation
    switch (order.source.flow) {
      case "redirect":
      	// do the redirect or iframe
        window.location.replace(order.source.redirect.url);
        break;
      case "receiver":
        // handle receiver flow
        console.log("in receiver flow");
        switch (order.source.type) {
          case "bitcoin":
              toggleBitcoinReceiverModal(order.source);
            break;
          default:
            console.log("unhandled receiver flow source");
        }
        break;
      case "code_verification":
        console.log("in code verification flow");
        break;
      case "none":
        console.log("no activation needed");
        break;
      default:
        console.log("unhandled flow in create context", order);
    }
  } else if (context === 'update') {
    switch (order.status) {
      case "succeeded":
        // succeeded nice, let's show it
        spinnerHandler(
          "result",
          "Thanks, we've received your order and confirmed that the payment succeeded."
        );
      break;
      case "pending":
        spinnerHandler(
          "result",
          "Thanks, we've received your order and will let you know once the payment is confirmed."
        );
      break;
      case "failed":
        spinnerHandler(
          "error",
          "Sorry, somehow this failed. Please try again, choose any payment method you like."
        );
      break;
      case "canceled":
        spinnerHandler(
          "error",
          "Sorry, something went wrong. Please try again."
        );
      break;
    }
  } else {
    console.warn("unknown context");
  }
}

// Helpers
// Get owner details from form
function getOwnerDetails() {
  return {
    name: $("#owner_name").val(),
    address: {
      line1: $("#address_line1").val(),
      city: $("#city").val(),
      postal_code: $("#postal_code").val(),
      country: 'DE',
    },
    email: $("#email").val(),
    phone: $("#phone").val(),
  };
}
// Handle redirect return
function handleRedirectReturn(sourceId) {
  spinnerHandler("loading");
  // Retrieve order source ID
  // Listen for changes on my order status (polling through firebase)
  firebase.database()
  .ref('/orders')
  .orderByChild('sourceId')
  .equalTo(sourceId)
  .on("value", function(snapshot) {
      var orders = snapshot.val();
      if(orders) {
          var orderId = Object.keys(orders)[0];
          var orderRef = firebase.database().ref('orders/' + orderId);
          orderRef.once('value').then((snapshot) => {
            var order = snapshot.val();
            orderRef.child("status").on('value', function(snapshot) {
              // Handle order
              order.status = snapshot.val();
              merchantOrderHandler(order, "update");
            });
          });
      } else {
        console.log("no order found for this source");
      }
  });
}
// Read out URL params
function getQueryParam(param) {
	var vars = {};
	window.location.href.replace( location.hash, '' ).replace(
		/[?&]+([^=&]+)=?([^&]*)?/gi, // regexp
		function( m, key, value ) { // callback
			vars[key] = value !== undefined ? value : '';
		}
	);

	if ( param ) {
		return vars[param] ? vars[param] : null;
	}
	return vars;
}
// Manage spinner, result and error messages
function spinnerHandler(mode, message) {
  $("#error").html("");
  $("#result").html("");
  $('.spinner').hide();
  $('.bg-danger').hide();
  $('.bg-success').hide();
  switch (mode) {
    case "loading":
      $('.spinner').show();
    break;
    case "result":
      $("#result").html(message);
      $('.bg-success').show();
    break;
    case "error":
      $("#error").html(message);
      $('.bg-danger').show();
    break;
  }
}
// Bitcoin receiver modal
function toggleBitcoinReceiverModal(source) {
  $('#bitcoinModal').modal('toggle');
  $("#btcAmount").html(source.bitcoin.amount/100000000);
  $("#btcAddress").html(source.receiver.address);
}
