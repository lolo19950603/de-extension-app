import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
// @ts-ignore: SVG asset import handled by bundler
import editIconSrc from '../assets/svgexport-2.png';



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
  const [confirmingCardId, setConfirmingCardId] = useState(null);
  const [editingCardId, setEditingCardId] = useState(null);
  const [confirmingSubscriptionId, setConfirmingSubscriptionId] = useState(null);
  const [editingItems, setEditingItems] = useState({});
  const [editingStatus, setEditingStatus] = useState({});
  const [editingFrequency, setEditingFrequency] = useState({});
  const [editingMonerisCard, setEditingMonerisCard] = useState({});
  const [savingSubscriptionId, setSavingSubscriptionId] = useState('');
  const [variantDetails, setVariantDetails] = useState({});
  const [editingSubscriptionId, setEditingSubscriptionId] = useState(null);
  const editModalRef = useRef(null);
  const editModalCloseButtonRef = useRef(null);
  const editCardModalRef = useRef(null);
  const pendingDeleteSubscriptionIdRef = useRef(null);
  const pendingDeleteCardIdRef = useRef(null);
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

  const handleDeleteCard = useCallback(async (cardId) => {
    // TODO: point this to your backend endpoint that deletes
    // the moneris_card metaobject and vault token.
    const url = 'https://3348-184-148-133-49.ngrok-free.app/card/delete';

    setDeletingCardId(cardId);
    setCardsError('');

    try {
      const customerGid = await fetchCustomerId();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({cardId, customerGid}),
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
  }, [fetchCustomerId]);

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

        let subscriptionLineItems = { currency: 'CAD', items: [] };
        try {
          const rawItems = fieldValue('subscription_line_items');
          if (rawItems) {
            const parsed = JSON.parse(rawItems);
            subscriptionLineItems = {
              currency: parsed.currency || 'CAD',
              items: Array.isArray(parsed.items) ? parsed.items : [],
            };
          }
        } catch (_err) {
          // ignore JSON parse errors and leave items empty
        }

        const rawFreqNum = fieldValue('frequency_number');
        const frequencyNumber = rawFreqNum ? Math.max(1, parseInt(rawFreqNum, 10) || 1) : 1;
        const rawFreqUnit = (fieldValue('frequency_unit') || 'week').toLowerCase();
        const frequencyUnit = ['day', 'week', 'month'].includes(rawFreqUnit) ? rawFreqUnit : 'week';

        const result = {
          id: node.id,
          status: fieldValue('status'),
          nextBillingDate: fieldValue('next_billing_date'),
          createdAt: fieldValue('last_billed_at'),
          subscriptionLineItems,
          items: subscriptionLineItems.items,
          frequencyNumber,
          frequencyUnit,
          monerisCard: fieldValue('moneris_card') || '',
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

  const loadVariantDetails = useCallback(async (variantIds) => {
    if (!variantIds || variantIds.length === 0) return;

    const uniqueIds = [...new Set(variantIds)];
    const query = {
      query: `
        query GetVariantDetails($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              title
              product {
                title
              }
              price {
                amount
                currencyCode
              }
            }
          }
        }
      `,
      variables: { ids: uniqueIds },
    };

    try {
      const response = await fetch(
        `shopify://storefront/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query),
        },
      );
      const { data } = await response.json();
      const nodes = data?.nodes || [];
      const details = {};
      nodes.forEach((node) => {
        if (node?.id) {
          const productTitle = node.product?.title || '';
          const variantTitle = node.title === 'Default Title' ? '' : node.title;
          const displayTitle = variantTitle ? `${productTitle} - ${variantTitle}` : productTitle || node.id;
          const price = node.price
            ? `${node.price.currencyCode} ${parseFloat(node.price.amount).toFixed(2)}`
            : '';
          details[node.id] = { displayTitle, price };
        }
      });
      setVariantDetails((prev) => ({ ...prev, ...details }));
    } catch (err) {
      console.error('Failed to load variant details:', err);
    }
  }, [API_VERSION]);

  useEffect(() => {
    if (!subscriptions || subscriptions.length === 0) return;
    const variantIds = subscriptions.flatMap((s) =>
      (s.items || []).map((i) => i.variant_id).filter(Boolean),
    );
    loadVariantDetails(variantIds);
  }, [subscriptions, loadVariantDetails]);

  const handleDeleteSubscription = useCallback(async (subscriptionId) => {
    // TODO: point this to your backend endpoint that deletes
    // the subscription_order metaobject and any related data.
    const url = 'https://3348-184-148-133-49.ngrok-free.app/api/subscription/delete';

    setDeletingSubscriptionId(subscriptionId);
    setSubscriptionsError('');

    try {
      const customerGid = await fetchCustomerId();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({subscriptionId, customerGid}),
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
  }, [fetchCustomerId]);

  const handleSaveSubscriptionEdits = useCallback(async (subscriptionId) => {
    const url = 'https://3348-184-148-133-49.ngrok-free.app/api/subscription/update';
    const items = editingItems[subscriptionId];

    if (items === undefined) return;

    const subscription = (subscriptions || []).find((s) => s.id === subscriptionId);
    const currency = subscription?.subscriptionLineItems?.currency || 'CAD';
    const status = editingStatus[subscriptionId] ?? subscription?.status ?? 'active';
    const freq = editingFrequency[subscriptionId] ?? { number: subscription?.frequencyNumber ?? 1, unit: subscription?.frequencyUnit ?? 'week' };
    const frequency_number = Math.max(1, parseInt(freq.number, 10) || 1);
    const frequency_unit = ['day', 'week', 'month'].includes(String(freq.unit).toLowerCase()) ? String(freq.unit).toLowerCase() : 'week';
    const moneris_card = editingMonerisCard[subscriptionId] ?? subscription?.monerisCard ?? '';

    const subscription_line_items = {
      currency,
      items,
    };

    setSavingSubscriptionId(subscriptionId);
    setSubscriptionsError('');

    try {
      const customerGid = await fetchCustomerId();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId,
          customerGid,
          subscription_line_items,
          status,
          frequency_number,
          frequency_unit,
          moneris_card,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      // Update local state immediately so Edit shows saved data without waiting for API refetch
      const savedStatus = editingStatus[subscriptionId] ?? subscription?.status ?? 'active';
      const savedMonerisCard = editingMonerisCard[subscriptionId] ?? subscription?.monerisCard ?? '';
      setSubscriptions((current) => {
        const list = current || [];
        return list.map((s) => {
          if (s.id !== subscriptionId) return s;
          return {
            ...s,
            status: savedStatus,
            subscriptionLineItems: { currency, items },
            items,
            frequencyNumber: frequency_number,
            frequencyUnit: frequency_unit,
            monerisCard: savedMonerisCard,
          };
        });
      });

      setExpandedSubscriptions((current) =>
        current.filter((id) => id !== subscriptionId),
      );
      setEditingItems((prev) => {
        const next = { ...prev };
        delete next[subscriptionId];
        return next;
      });
      setEditingStatus((prev) => {
        const next = { ...prev };
        delete next[subscriptionId];
        return next;
      });
      setEditingFrequency((prev) => {
        const next = { ...prev };
        delete next[subscriptionId];
        return next;
      });
      setEditingMonerisCard((prev) => { const next = { ...prev }; delete next[subscriptionId]; return next; });
      // Don't refetch here: Shopify metaobjects can be delayed, and would overwrite our local update with stale data
    } catch (err) {
      console.error(err);
      setSubscriptionsError('Unable to save changes right now.');
    } finally {
      setSavingSubscriptionId('');
    }
  }, [editingItems, editingStatus, editingFrequency, editingMonerisCard, fetchCustomerId, subscriptions]);

  const removeLineItem = useCallback((subscriptionId, index) => {
    setEditingItems((prev) => {
      const current = prev[subscriptionId] || [];
      const next = current.filter((_, i) => i !== index);
      return { ...prev, [subscriptionId]: next };
    });
  }, []);

  const updateLineItemQuantity = useCallback((subscriptionId, index, delta) => {
    setEditingItems((prev) => {
      const current = prev[subscriptionId] || [];
      const next = current.map((item, i) => {
        if (i !== index) return item;
        const qty = Math.max(0, (item.quantity || 1) + delta);
        if (qty === 0) return null;
        return { ...item, quantity: qty };
      }).filter(Boolean);
      return { ...prev, [subscriptionId]: next };
    });
  }, []);

  const openEditModal = useCallback((subscription) => {
    setEditingSubscriptionId(subscription.id);
    setEditingItems((prev) => ({
      ...prev,
      [subscription.id]: (subscription.items || []).map((i) => ({ ...i, quantity: i.quantity ?? 1 })),
    }));
    setEditingStatus((prev) => ({
      ...prev,
      [subscription.id]: (subscription.status || 'active').toLowerCase(),
    }));
    setEditingFrequency((prev) => ({
      ...prev,
      [subscription.id]: {
        number: subscription.frequencyNumber ?? 1,
        unit: subscription.frequencyUnit ?? 'week',
      },
    }));
    setEditingMonerisCard((prev) => ({ ...prev, [subscription.id]: subscription.monerisCard ?? '' }));
  }, []);

  const closeEditModal = useCallback(() => {
    const pendingSubId = pendingDeleteSubscriptionIdRef.current;
    if (pendingSubId) {
      pendingDeleteSubscriptionIdRef.current = null;
      handleDeleteSubscription(pendingSubId);
    }
    const id = editingSubscriptionId;
    setEditingSubscriptionId(null);
    if (id) {
      setEditingItems((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setEditingStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setEditingFrequency((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setEditingMonerisCard((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }
    setConfirmingSubscriptionId(null);
  }, [editingSubscriptionId, handleDeleteSubscription]);

  const closeEditModalAndHide = useCallback(() => {
    editModalRef.current?.hideOverlay?.();
  }, []);

  const closeEditCardModal = useCallback(() => {
    const pendingId = pendingDeleteCardIdRef.current;
    if (pendingId) {
      pendingDeleteCardIdRef.current = null;
      handleDeleteCard(pendingId);
    }
    setEditingCardId(null);
    setConfirmingCardId(null);
  }, [handleDeleteCard]);

  return (
    <s-stack gap="small">
      {/* Moneris cards section */}
      <s-section>
        <s-stack gap="large">
          <s-stack direction="inline" gap="base">
            <s-heading>Moneris payment methods</s-heading>
            <s-link onClick={handleSaveCard}>
              + Add
            </s-link>
          </s-stack>
          <s-banner>
            <s-text type="small">
              Save a credit card securely for future purchases. Your card details are entered on Moneris and never stored by us.
            </s-text>
          </s-banner>

          {cardsLoading && (
            <s-text type="small">Loading saved cards…</s-text>
          )}

          {cardsError && (
            <s-banner>
              <s-text type="small">
                {cardsError}
              </s-text>
            </s-banner>
          )}

          {cards && !cardsLoading && !cardsError && (
            cards.length > 0 ? (
              <s-stack gap="large">
                <s-stack direction="inline" gap="large">
                  {cards.map((card) => (
                    <s-box key={card.id} padding="base" border="none" borderRadius="large">
                      <s-stack gap="base">
                        <s-stack direction="inline" gap="base" justifyContent="space-between">
                          <s-text>Card</s-text>
                          {deletingCardId === card.id ? (
                            <s-text type="small">Removing…</s-text>
                          ) : (
                            <s-link
                              commandFor="edit-card-modal"
                              command="--show"
                              onClick={() => setEditingCardId(card.id)}
                            >
                              <s-image src={editIconSrc} />
                            </s-link>
                          )}
                        </s-stack>
                        <s-text>
                          Ending in: {card.last4}
                        </s-text>
                        <s-text type="small">
                          Expires: {card.expiry && String(card.expiry).length === 4 ? `${String(card.expiry).slice(0, 2)}/${String(card.expiry).slice(2)}` : card.expiry}
                        </s-text>
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              </s-stack>
            ) : (
              <s-banner>
                <s-text type="small">
                  You don&apos;t have any saved cards yet.
                </s-text>
              </s-banner>
            )
          )}
        </s-stack>
      </s-section>

      {/* Edit card modal: view card details, only action is Delete (with confirm) */}
      <s-modal
        ref={editCardModalRef}
        id="edit-card-modal"
        heading="Card"
        accessibilityLabel="Edit card"
        onHide={closeEditCardModal}
      >
        {editingCardId && (() => {
          const card = (cards || []).find((c) => c.id === editingCardId);
          if (!card) return null;
          const isConfirmView = confirmingCardId === editingCardId;
          if (isConfirmView) {
            return (
              <s-box padding="base">
                <s-stack gap="base">
                  <s-text>Are you sure you want to remove this card?</s-text>
                  <s-stack direction="inline" gap="base" justifyContent="space-between">
                    <s-link onClick={() => setConfirmingCardId(null)}>
                      Back
                    </s-link>
                    <s-button
                      variant="primary"
                      tone="critical"
                      loading={deletingCardId === editingCardId}
                      onClick={() => {
                        pendingDeleteCardIdRef.current = editingCardId;
                        editCardModalRef.current?.hideOverlay?.();
                      }}
                    >
                      Yes
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            );
          }
          return (
            <s-box padding="base">
              <s-stack gap="base">
                <s-text>
                  Ending in: {card.last4}
                </s-text>
                <s-text type="small">
                  Expires: {card.expiry && String(card.expiry).length === 4 ? `${String(card.expiry).slice(0, 2)}/${String(card.expiry).slice(2)}` : card.expiry}
                </s-text>
                <s-stack direction="inline" gap="base" justifyContent="space-between">
                  <s-button
                    variant="secondary"
                    tone="critical"
                    onClick={() => setConfirmingCardId(editingCardId)}
                  >
                    Delete
                  </s-button>
                  <s-link
                    commandFor="edit-card-modal"
                    command="--hide"
                    onClick={() => {
                      setEditingCardId(null);
                      setConfirmingCardId(null);
                    }}
                  >
                    Close
                  </s-link>
                </s-stack>
              </s-stack>
            </s-box>
          );
        })()}
      </s-modal>

      {/* Subscriptions section */}
      <s-section heading="Subscriptions">
        <s-box padding="base" border="none" borderRadius="large">
          <s-stack gap="large">
            <s-text type="small">
              Manage your recurring orders and billing.
            </s-text>
            {subscriptionsLoading && (
              <s-text type="small">Loading subscriptions…</s-text>
            )}

            {subscriptionsError && (
              <s-banner>
                <s-text type="small">
                  {subscriptionsError}
                </s-text>
              </s-banner>
            )}

            {subscriptions && !subscriptionsLoading && !subscriptionsError && (
              subscriptions.length > 0 ? (
                <s-stack direction="inline" gap="large">
                  {subscriptions.map((subscription) => {
                    const title = subscription.title || subscription.name || 'Subscription';

                    return (
                      <s-box
                        key={subscription.id}
                        padding="base"
                        border="none"
                        borderRadius="large"
                      >
                        <s-stack gap="base">
                          <s-stack direction="inline" gap="base" justifyContent="space-between">
                            <s-text>
                              {title}
                            </s-text>
                          {deletingSubscriptionId === subscription.id ? (
                            <s-text type="small">Removing…</s-text>
                          ) : (
                            <s-link
                              commandFor="edit-subscription-modal"
                              command="--show"
                              onClick={() => openEditModal(subscription)}
                            >
                              <s-image src={editIconSrc} />
                            </s-link>
                          )}
                          </s-stack>
                          {subscription.status && (
                            <s-text type="small">
                              Status: {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1).toLowerCase()}
                            </s-text>
                          )}
                          {subscription.nextBillingDate && (
                            <s-text type="small">
                              Next billing: {subscription.nextBillingDate}
                            </s-text>
                          )}
                          {(subscription.frequencyNumber != null && subscription.frequencyUnit) && (
                            <s-text type="small">
                              Delivery: Every {subscription.frequencyNumber} {subscription.frequencyNumber === 1
                                ? (subscription.frequencyUnit === 'day' ? 'day' : subscription.frequencyUnit === 'week' ? 'week' : 'month')
                                : (subscription.frequencyUnit === 'day' ? 'day(s)' : subscription.frequencyUnit === 'week' ? 'week(s)' : 'month(s)')}
                            </s-text>
                          )}
                        </s-stack>
                      </s-box>
                    );
                  })}
                </s-stack>
              ) : (
              <s-banner>
                <s-text type="small">
                  You don&apos;t have any active subscriptions yet.
                </s-text>
              </s-banner>
            )
          )}
          </s-stack>
        </s-box>
      </s-section>

      {/* Edit subscription modal */}
      <s-modal
        ref={editModalRef}
        id="edit-subscription-modal"
        heading="Edit subscription"
        accessibilityLabel="Edit subscription"
        onHide={closeEditModal}
      >
        {editingSubscriptionId && (() => {
          const subscription = (subscriptions || []).find((s) => s.id === editingSubscriptionId);
          if (!subscription) return null;

          const isDeleteConfirmView = confirmingSubscriptionId === subscription.id;

          if (isDeleteConfirmView) {
            return (
              <s-box padding="base">
                <s-stack gap="base">
                  <s-text>Delete subscription?</s-text>
                  <s-text type="small">Existing orders are not affected.</s-text>
                  <s-stack direction="inline" gap="base" justifyContent="space-between">
                    <s-link onClick={() => setConfirmingSubscriptionId(null)}>
                      Back
                    </s-link>
                    <s-button
                      variant="primary"
                      tone="critical"
                      onClick={() => {
                        pendingDeleteSubscriptionIdRef.current = subscription.id;
                        editModalRef.current?.hideOverlay?.();
                      }}
                    >
                      Delete subscription
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            );
          }

          return (
            <s-box padding="base">
            <s-stack gap="base">
              <s-select
                label="Status"
                value={(editingStatus[subscription.id] ?? subscription.status ?? 'active').toLowerCase()}
                onChange={(/** @type {any} */ e) => {
                  const value = e?.currentTarget && e.currentTarget.value ? String(e.currentTarget.value) : 'active';
                  const normalized = value === 'pause' ? 'pause' : 'active';
                  setEditingStatus((prev) => ({ ...prev, [subscription.id]: normalized }));
                }}
              >
                <s-option value="active">Active</s-option>
                <s-option value="pause">Pause</s-option>
              </s-select>

              <s-stack gap="small">
                {/* @ts-ignore s-number-field value is string-based in runtime */}
                <s-number-field
                  name={`frequency-number-${subscription.id}`}
                  label="Delivery frequency"
                  min={1}
                  value={String((editingFrequency[subscription.id] ?? { number: subscription.frequencyNumber ?? 1 }).number)}
                  onChange={(/** @type {any} */ e) => {
                    const raw = e?.target && e.target.value ? String(e.target.value) : '';
                    setEditingFrequency((prev) => ({
                      ...prev,
                      [subscription.id]: {
                        ...(prev[subscription.id] ?? { number: 1, unit: 'week' }),
                        number: raw,
                      },
                    }));
                  }}
                />
                <s-select
                  label="Frequency unit"
                  value={(editingFrequency[subscription.id] ?? { unit: subscription.frequencyUnit ?? 'week' }).unit}
                  onChange={(/** @type {any} */ e) => {
                    const rawUnit = e?.currentTarget && e.currentTarget.value ? String(e.currentTarget.value) : 'week';
                    const normalized = ['day', 'week', 'month'].includes(rawUnit) ? rawUnit : 'week';
                    setEditingFrequency((prev) => ({
                      ...prev,
                      [subscription.id]: {
                        ...(prev[subscription.id] ?? { number: 1, unit: 'week' }),
                        unit: normalized,
                      },
                    }));
                  }}
                >
                  <s-option value="day">Day(s)</s-option>
                  <s-option value="week">Week(s)</s-option>
                  <s-option value="month">Month(s)</s-option>
                </s-select>
              </s-stack>

              <s-select
                label="Moneris card"
                value={editingMonerisCard[subscription.id] ?? subscription.monerisCard ?? ''}
                onChange={(/** @type {any} */ e) => {
                  const value = e?.currentTarget?.value != null ? String(e.currentTarget.value) : '';
                  setEditingMonerisCard((prev) => ({ ...prev, [subscription.id]: value }));
                }}
              >
                {(cards || []).map((card) => (
                  <s-option key={card.id} value={card.id}>
                    Ending in {card.last4}
                  </s-option>
                ))}
              </s-select>

              <s-stack gap="large">
                <s-text>Items in this subscription</s-text>
                {(editingItems[subscription.id] || subscription.items || []).length > 0 ? (
                  <s-stack gap="base">
                    {(editingItems[subscription.id] ?? subscription.items ?? []).map((item, index) => {
                      const details = variantDetails[item.variant_id];
                      const displayTitle = details?.displayTitle || item.name || item.variant_id || 'Item';
                      const displayPrice = details?.price || item.price;
                      return (
                        <s-box key={item.variant_id || index} padding="base" border="none" borderRadius="large">
                          <s-stack direction="inline" gap="base">
                            <s-stack gap="small">
                              <s-text>
                                {displayTitle}
                              </s-text>
                              {displayPrice && (
                                <s-text>
                                  {displayPrice}
                                </s-text>
                              )}
                              <s-stack direction="inline" gap="base">
                                <s-link onClick={() => updateLineItemQuantity(subscription.id, index, -1)}>
                                  −
                                </s-link>
                                <s-text>
                                  {item.quantity ?? 1}
                                </s-text>
                                <s-link onClick={() => updateLineItemQuantity(subscription.id, index, 1)}>
                                  +
                                </s-link>
                                <s-link onClick={() => removeLineItem(subscription.id, index)}>
                                  Remove
                                </s-link>
                              </s-stack>
                            </s-stack>
                          </s-stack>
                        </s-box>
                      );
                    })}
                  </s-stack>
                ) : (
                  <s-text>No items in this subscription.</s-text>
                )}
              </s-stack>

              {subscription.createdAt && (
                <s-text type="small">
                  Started on: {subscription.createdAt}
                </s-text>
              )}

              {subscriptionsError && (
                <s-banner tone="critical">
                  <s-text type="small">
                    {subscriptionsError}
                  </s-text>
                </s-banner>
              )}

              <s-stack direction="inline" gap="base" justifyContent="space-between">
                <s-button
                  variant="secondary"
                  tone="critical"
                  onClick={() => setConfirmingSubscriptionId(subscription.id)}
                >
                  Delete
                </s-button>
                <s-stack direction="inline" gap="base">
                  <s-link
                    ref={editModalCloseButtonRef}
                    commandFor="edit-subscription-modal"
                    command="--hide"
                    onClick={closeEditModal}
                  >
                    Cancel
                  </s-link>
                  <s-button
                    variant="primary"
                    loading={savingSubscriptionId === editingSubscriptionId}
                    onClick={async () => {
                      if (!editingSubscriptionId) return;
                      await handleSaveSubscriptionEdits(editingSubscriptionId);
                      closeEditModalAndHide();
                    }}
                  >
                    Save
                  </s-button>
                </s-stack>
              </s-stack>
            </s-stack>
            </s-box>
          );
        })()}
      </s-modal>
    </s-stack>
  );
}
