import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useCallback, useEffect, useState} from 'preact/hooks';



export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [cards, setCards] = useState(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const [subscriptions, setSubscriptions] = useState(null);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState('');
  const [expandedSubscriptions, setExpandedSubscriptions] = useState([]);
  const [deletingSubscriptionId, setDeletingSubscriptionId] = useState('');
  const [deletingCardId, setDeletingCardId] = useState('');

  const API_VERSION = '2026-01';
  const getCustomerIdQuery = {
    query: `
      query GetCurrentCustomerId {
        customer {
          id
        }
      }
    `,
  };

  const fetchCustomerId = useCallback(async () => {
    const customerDataResponse = await fetch(
      `shopify://customer-account/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(getCustomerIdQuery),
      },
    );
    const { data } = await customerDataResponse.json();
    return data.customer.id;
  }, []);

  const handleSaveCard = useCallback(async () => {
    const url = 'https://3348-184-148-133-49.ngrok-free.app/create-customer-session/save-card';

    try {
      const customerId = await fetchCustomerId();
      const checkoutAppResponse = await fetch(url, { method: 'HEAD' }); // just check if it exists
      if (!checkoutAppResponse.ok) throw new Error('Checkout app not reachable');
      // NOTE: Customer account UI extensions can't create Shopify-style modals for external pages,
      // so we continue to open the Moneris flow in a new window/tab.
      window.open(`${url}?customerId=${encodeURIComponent(customerId)}`, '_blank');
    } catch (err) {
      console.error(err);
      alert('The card-saving service is temporarily unavailable. Please try again later.');
    }
  }, [fetchCustomerId]);

  const handleDeleteCard = useCallback(async (cardId, token) => {
    // TODO: point this to your backend endpoint that deletes
    // the moneris_card metaobject and vault token.
    const url = 'https://3348-184-148-133-49.ngrok-free.app/delete-moneris-card';

    setDeletingCardId(cardId);
    setCardsError('');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({cardId, token}),
      });

      if (!response.ok) {
        throw new Error('Failed to delete card');
      }

      setCards((current) =>
        (current || []).filter((card) => card.id !== cardId),
      );
    } catch (err) {
      console.error(err);
      setCardsError('Unable to delete this card right now.');
    } finally {
      setDeletingCardId('');
    }
  }, []);

  const loadCards = useCallback(async () => {
    setCardsError('');
    setCardsLoading(true);

    try {
      const customerId = await fetchCustomerId();

      const query = {
        query: `
          query GetMonerisCards {
            metaobjects(
              type: "moneris_card"
              first: 50
            ) {
              edges {
                node {
                  id
                  fields {
                    key
                    value
                  }
                }
              }
            }
          }
        `,
      };

      const response = await fetch(
        `shopify://storefront/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(query),
        },
      );

      const { data, errors } = await response.json();

      if (errors && errors.length) {
        throw new Error(errors[0].message || 'Failed to fetch cards');
      }

      const edges = data?.metaobjects?.edges || [];

      const mappedCards = edges.map((edge) => {
        const node = edge.node;
        const fields = node.fields || [];

        const fieldValue = (key) =>
          (fields.find((field) => field.key === key) || {}).value || '';

        const result = {
          id: node.id,
          last4: fieldValue('last4'),
          expiry: fieldValue('expiry'),
          token: fieldValue('token'),
        };

        const ownerId = fieldValue('customer_id');
        if (ownerId && ownerId !== customerId) {
          return null;
        }

        return result;
      }).filter((card) => card !== null);

      setCards(mappedCards);
    } catch (err) {
      console.error(err);
      setCardsError('Unable to load saved cards right now.');
    } finally {
      setCardsLoading(false);
    }
  }, [API_VERSION, fetchCustomerId]);

  const loadSubscriptions = useCallback(async () => {
    setSubscriptionsError('');
    setSubscriptionsLoading(true);

    try {
      const customerId = await fetchCustomerId();

      const query = {
        query: `
          query GetSubscriptionOrders {
            metaobjects(
              type: "subscription_order"
              first: 50
            ) {
              edges {
                node {
                  id
                  fields {
                    key
                    value
                  }
                }
              }
            }
          }
        `,
      };

      const response = await fetch(
        `shopify://storefront/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(query),
        },
      );

      const { data, errors } = await response.json();

      if (errors && errors.length) {
        throw new Error(errors[0].message || 'Failed to fetch subscriptions');
      }

      const edges = data?.metaobjects?.edges || [];

      const mappedSubscriptions = edges.map((edge) => {
        const node = edge.node;
        const fields = node.fields || [];

        const fieldValue = (key) =>
          (fields.find((field) => field.key === key) || {}).value || '';

        let items = [];
        try {
          const rawItems = fieldValue('subscription_line_items');
          if (rawItems) {
            items = JSON.parse(rawItems);
          }
        } catch (_err) {
          // ignore JSON parse errors and leave items empty
        }

        const result = {
          id: node.id,
          status: fieldValue('status'),
          nextBillingDate: fieldValue('next_billing_date'),
          createdAt: fieldValue('last_billed_at'),
          items,
        };

        const ownerId = fieldValue('customer_id');
        if (ownerId && ownerId !== customerId) {
          return null;
        }

        return result;
      }).filter((subscription) => subscription !== null);

      setSubscriptions(mappedSubscriptions);
    } catch (err) {
      console.error(err);
      setSubscriptionsError('Unable to load subscriptions right now.');
    } finally {
      setSubscriptionsLoading(false);
    }
  }, [API_VERSION, fetchCustomerId]);

  useEffect(() => {
    // Load cards and subscriptions immediately so items are shown without needing a button click
    loadCards();
    loadSubscriptions();
  }, [loadCards, loadSubscriptions]);

  const handleDeleteSubscription = useCallback(async (subscriptionId) => {
    // TODO: point this to your backend endpoint that deletes
    // the subscription_order metaobject and any related data.
    const url = 'https://3348-184-148-133-49.ngrok-free.app/delete-subscription-order';

    setDeletingSubscriptionId(subscriptionId);
    setSubscriptionsError('');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({subscriptionId}),
      });

      if (!response.ok) {
        throw new Error('Failed to delete subscription');
      }

      setSubscriptions((current) =>
        (current || []).filter((subscription) => subscription.id !== subscriptionId),
      );
    } catch (err) {
      console.error(err);
      setSubscriptionsError('Unable to delete this subscription right now.');
    } finally {
      setDeletingSubscriptionId('');
    }
  }, []);

  return (
    <s-stack gap="base">
      {/* Moneris cards section */}
      <s-box padding="base" border="base" borderRadius="large">
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <s-text>
              Moneris payment methods
            </s-text>
            <s-link onClick={handleSaveCard}>
              + Add
            </s-link>
          </s-stack>
          <s-banner>
            <s-text>
              Save a credit card securely for future purchases.
              Your card details are entered on Moneris and never stored by us.
            </s-text>
          </s-banner>

          {cardsLoading && (
            <s-text>Loading saved cards…</s-text>
          )}

          {cardsError && (
            <s-text>
              {cardsError}
            </s-text>
          )}

          {cards && !cardsLoading && !cardsError && (
            cards.length > 0 ? (
              <s-stack gap="small">
                <s-text>
                  Saved cards
                </s-text>
                <s-stack direction="inline" gap="base">
                  {cards.map((card) => (
                    <s-box key={card.id} padding="small" border="base" borderRadius="large">
                      <s-stack gap="small">
                        <s-text>
                          ending in {card.last4}
                        </s-text>
                        <s-text>
                          Expires {card.expiry}
                        </s-text>
                        {deletingCardId === card.id ? (
                          <s-text>Removing…</s-text>
                        ) : (
                          <s-link
                            onClick={() => {
                              if (window.confirm('Remove this card?')) {
                                handleDeleteCard(card.id, card.token);
                              }
                            }}
                          >
                            Remove
                          </s-link>
                        )}
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              </s-stack>
            ) : (
              <s-text>
                You don&apos;t have any saved cards yet.
              </s-text>
            )
          )}
        </s-stack>
      </s-box>

      {/* Subscriptions section */}
      <s-box padding="base" border="base" borderRadius="large">
        <s-stack gap="base">
          <s-text>
            Subscriptions
          </s-text>
          <s-text>
            Your active subscription orders.
          </s-text>

          {subscriptionsLoading && (
            <s-text>Loading subscriptions…</s-text>
          )}

          {subscriptionsError && (
            <s-text>
              {subscriptionsError}
            </s-text>
          )}

          {subscriptions && !subscriptionsLoading && !subscriptionsError && (
            subscriptions.length > 0 ? (
              <s-stack gap="small">
                <s-stack direction="inline" gap="base">
                  {subscriptions.map((subscription) => {
                  const isExpanded = expandedSubscriptions.includes(subscription.id);
                  const title = subscription.title || subscription.name || 'Subscription';

                  return (
                    <s-box
                      key={subscription.id}
                      padding="small"
                      border="base"
                      borderRadius="large"
                    >
                      <s-stack gap="small">
                        <s-stack direction="inline" gap="base">
                          <s-text>
                            {title}
                          </s-text>
                          {subscription.status && (
                            <s-text>
                              Status: {subscription.status}
                            </s-text>
                          )}
                          {subscription.nextBillingDate && (
                            <s-text>
                              Next billing: {subscription.nextBillingDate}
                            </s-text>
                          )}
                          <s-link
                            onClick={() => {
                              setExpandedSubscriptions((current) =>
                                current.includes(subscription.id)
                                  ? current.filter((id) => id !== subscription.id)
                                  : [...current, subscription.id],
                              );
                            }}
                          >
                            {isExpanded ? 'Done' : 'Edit'}
                          </s-link>
                        </s-stack>

                        {isExpanded && (
                          <s-stack gap="small">
                            {subscription.items && subscription.items.length > 0 && (
                              <s-stack gap="small">
                                {subscription.items.map((item) => (
                                  <s-box key={item.id || item.sku}>
                                    <s-text>
                                      {item.name} {item.quantity ? `× ${item.quantity}` : ''}
                                    </s-text>
                                    {item.price && (
                                      <s-text>
                                        {item.price}
                                      </s-text>
                                    )}
                                  </s-box>
                                ))}
                              </s-stack>
                            )}

                            {subscription.createdAt && (
                              <s-text>
                                Started on: {subscription.createdAt}
                              </s-text>
                            )}
                            <s-stack direction="inline" gap="base">
                              {deletingSubscriptionId === subscription.id ? (
                                <s-text>Deleting…</s-text>
                              ) : (
                                <s-link
                                  onClick={() => {
                                    if (window.confirm('Delete this subscription?')) {
                                      handleDeleteSubscription(subscription.id);
                                    }
                                  }}
                                >
                                  Delete
                                </s-link>
                              )}
                            </s-stack>
                          </s-stack>
                        )}
                      </s-stack>
                    </s-box>
                  );
                })}
                </s-stack>
              </s-stack>
            ) : (
              <s-text>
                You don&apos;t have any active subscriptions yet.
              </s-text>
            )
          )}
        </s-stack>
      </s-box>
    </s-stack>
  );
}
