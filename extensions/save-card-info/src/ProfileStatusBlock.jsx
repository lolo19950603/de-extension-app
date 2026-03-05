import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';


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
  const [editingShippingAddress, setEditingShippingAddress] = useState({});
  const [editingBillingAddress, setEditingBillingAddress] = useState({});
  const [customerAddresses, setCustomerAddresses] = useState([]);
  const [savingSubscriptionId, setSavingSubscriptionId] = useState('');
  const [variantDetails, setVariantDetails] = useState({});
  const [editingSubscriptionId, setEditingSubscriptionId] = useState(null);
  const [agreeLoading, setAgreeLoading] = useState(false);
  const editModalRef = useRef(null);
  const editModalCloseButtonRef = useRef(null);
  const editCardModalRef = useRef(null);
  const consentModalRef = useRef(null);
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
      throw err;
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

        let shipping_address = null;
        let billing_address = null;
        try {
          const rawShipping = fieldValue('shipping_address');
          if (rawShipping) shipping_address = JSON.parse(rawShipping);
        } catch (_e) { /* ignore */ }
        try {
          const rawBilling = fieldValue('billing_address');
          if (rawBilling) billing_address = JSON.parse(rawBilling);
        } catch (_e) { /* ignore */ }

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
          shipping_address,
          billing_address,
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

  const loadCustomerAddresses = useCallback(async () => {
    const query = {
      query: `
        query GetCustomerAddresses {
          customer {
            defaultAddress { id }
            addresses(first: 50) {
              nodes {
                id
                firstName
                lastName
                name
                company
                address1
                address2
                city
                province
                zoneCode
                territoryCode
                zip
                phoneNumber
                country
              }
            }
          }
        }
      `,
    };
    try {
      const response = await fetch(
        `shopify://customer-account/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query),
        },
      );
      const { data, errors } = await response.json();
      if (errors?.length) return;
      const defaultId = data?.customer?.defaultAddress?.id || null;
      const nodes = data?.customer?.addresses?.nodes || [];
      const mapped = nodes.map((node) => ({
        id: node.id,
        customer_id: null,
        first_name: node.firstName || '',
        last_name: node.lastName || '',
        company: node.company || null,
        address1: node.address1 || '',
        address2: node.address2 || null,
        city: node.city || '',
        province: node.province || '',
        country: node.country || '',
        zip: node.zip || '',
        phone: node.phoneNumber || null,
        name: node.name || [node.firstName, node.lastName].filter(Boolean).join(' ') || '',
        province_code: node.zoneCode || '',
        country_code: node.territoryCode || '',
        country_name: node.country || '',
        default: defaultId ? node.id === defaultId : false,
      }));
      setCustomerAddresses(mapped);
    } catch (err) {
      console.error('Failed to load customer addresses:', err);
    }
  }, [API_VERSION]);

  useEffect(() => {
    // Load cards and subscriptions immediately so items are shown without needing a button click
    loadCards();
    loadSubscriptions();
    loadCustomerAddresses();
  }, [loadCards, loadSubscriptions, loadCustomerAddresses]);

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
    const shipping_address_id = editingShippingAddress[subscriptionId] ?? subscription?.shipping_address?.id ?? '';
    const billing_address_id = editingBillingAddress[subscriptionId] ?? subscription?.billing_address?.id ?? '';
    const shipping_address = (customerAddresses || []).find((a) => a.id === shipping_address_id) ?? subscription?.shipping_address ?? null;
    const billing_address = (customerAddresses || []).find((a) => a.id === billing_address_id) ?? subscription?.billing_address ?? null;

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
          shipping_address,
          billing_address,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      // Update local state immediately so Edit shows saved data without waiting for API refetch
      const savedStatus = editingStatus[subscriptionId] ?? subscription?.status ?? 'active';
      const savedMonerisCard = editingMonerisCard[subscriptionId] ?? subscription?.monerisCard ?? '';
      const savedShippingAddress = shipping_address;
      const savedBillingAddress = billing_address;
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
            shipping_address: savedShippingAddress,
            billing_address: savedBillingAddress,
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
      setEditingShippingAddress((prev) => { const next = { ...prev }; delete next[subscriptionId]; return next; });
      setEditingBillingAddress((prev) => { const next = { ...prev }; delete next[subscriptionId]; return next; });
      // Don't refetch here: Shopify metaobjects can be delayed, and would overwrite our local update with stale data
    } catch (err) {
      console.error(err);
      setSubscriptionsError('Unable to save changes right now.');
    } finally {
      setSavingSubscriptionId('');
    }
  }, [editingItems, editingStatus, editingFrequency, editingMonerisCard, editingShippingAddress, editingBillingAddress, customerAddresses, fetchCustomerId, subscriptions]);

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
    const addrs = customerAddresses || [];
    const matchAddr = (saved) => {
      if (!saved) return addrs[0]?.id ?? '';
      if (addrs.some((a) => a.id === saved.id)) return saved.id;
      const byLocation = addrs.find(
        (a) =>
          (a.address1 || '') === (saved.address1 || '') &&
          (a.city || '') === (saved.city || '') &&
          (a.zip || '') === (saved.zip || ''),
      );
      return byLocation?.id ?? addrs[0]?.id ?? '';
    };
    const matchShippingId = matchAddr(subscription.shipping_address);
    const matchBillingId = matchAddr(subscription.billing_address);
    setEditingShippingAddress((prev) => ({
      ...prev,
      [subscription.id]: matchShippingId,
    }));
    setEditingBillingAddress((prev) => ({
      ...prev,
      [subscription.id]: matchBillingId,
    }));
  }, [customerAddresses]);

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
      setEditingShippingAddress((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setEditingBillingAddress((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }
    setConfirmingSubscriptionId(null);
  }, [editingSubscriptionId, handleDeleteSubscription]);

  const formatAddressLabel = useCallback((addr) => {
    if (!addr || typeof addr !== 'object') return 'Select address';
    const name = addr.name || [addr.first_name, addr.last_name].filter(Boolean).join(' ') || '';
    const line1 = addr.address1 || '';
    const city = addr.city || '';
    const region = addr.province_code || addr.zoneCode || addr.province || '';
    const parts = [name, line1, city, region].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Select address';
  }, []);

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
      {agreeLoading && (
        <s-box padding="large">
          <s-stack gap="base" alignItems="center">
            <s-spinner size="large" accessibilityLabel="Opening secure payment page" />
            <s-text>Opening secure payment page… Please wait.</s-text>
          </s-stack>
        </s-box>
      )}
      {!agreeLoading && (
        <>
      {/* Moneris cards section */}
      <s-section>
        <s-stack gap="large">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-heading>Moneris payment methods</s-heading>
            <s-link
              commandFor="consent-modal"
              command="--show"
            >
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
                    <s-stack key={card.id} direction="inline" gap="large">
                      <s-stack gap="base">
                        <s-text>Card</s-text>
                        <s-text>
                          Ending in: {card.last4}
                        </s-text>
                        <s-text type="small">
                          Expires: {card.expiry && String(card.expiry).length === 4 ? `${String(card.expiry).slice(0, 2)}/${String(card.expiry).slice(2)}` : card.expiry}
                        </s-text>
                      </s-stack>
                      <s-stack gap="base">
                      {deletingCardId === card.id ? (
                        <s-text type="small">Removing…</s-text>
                      ) : (
                        <s-link
                          commandFor="edit-card-modal"
                          command="--show"
                          onClick={() => setEditingCardId(card.id)}
                        >
                          edit
                        </s-link>
                      )}
                      </s-stack>
                    </s-stack>
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

      {/* Consent modal: must agree before saving a card or using subscription features */}
      <s-modal
        ref={consentModalRef}
        id="consent-modal"
        heading="Third-party payment and subscription terms"
        accessibilityLabel="Consent agreement"
        onHide={() => {}}
      >
        <s-box padding="base">
          <s-stack gap="base">
            <s-text>
              Before you save a payment method or use subscription features, please read and accept the following.
            </s-text>
            <s-text type="small">
              <strong>This feature is not provided by Shopify.</strong> Saving payment methods and managing subscriptions on this page is a custom solution built by Bayshore (the merchant) and is separate from Shopify&apos;s native checkout, payment, and subscription services. Shopify does not operate, endorse, or guarantee this feature.
            </s-text>
            <s-text type="small">
              Your payment details and subscription data will be collected and processed by or on behalf of the merchant and their chosen payment and subscription providers, in accordance with the merchant&apos;s privacy policy and applicable law. This may involve redirecting you to a secure third-party page to add a card.
            </s-text>
            <s-text type="small">
              By clicking &quot;I agree&quot;, you confirm that you have read this notice, understand that this is a third-party feature and not a Shopify service, and consent to use it. You can cancel without agreeing; no payment method or subscription will be added.
            </s-text>
            <s-stack direction="inline" gap="base" justifyContent="space-between">
              <s-link
                commandFor="consent-modal"
                command="--hide"
              >
                Cancel
              </s-link>
              <s-button
                variant="primary"
                onClick={() => {
                  consentModalRef.current?.hideOverlay?.();
                  setAgreeLoading(true);
                  handleSaveCard()
                    .then(() => {
                      // Keep loading visible until the new tab has had time to open and load
                      setTimeout(() => setAgreeLoading(false), 2500);
                    })
                    .catch(() => setAgreeLoading(false));
                }}
              >
                I agree
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-modal>

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
                <s-stack gap="large">
                  <s-stack direction="inline" gap="large">
                    {subscriptions.map((subscription) => {
                      const title = subscription.title || subscription.name || 'Subscription';
                      return (
                        <s-stack key={subscription.id} direction="inline" gap="large">
                          <s-stack gap="base">
                            <s-text>
                              {title}
                            </s-text>
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
                          <s-stack gap="base">
                            {deletingSubscriptionId === subscription.id ? (
                              <s-text type="small">Removing…</s-text>
                            ) : (
                              <s-link
                                commandFor="edit-subscription-modal"
                                command="--show"
                                onClick={() => openEditModal(subscription)}
                              >
                                Edit
                              </s-link>
                            )}
                          </s-stack>
                        </s-stack>
                      );
                    })}
                  </s-stack>
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
                label="Payment method"
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

              <s-select
                label="Shipping address"
                value={editingShippingAddress[subscription.id] ?? subscription.shipping_address?.id ?? (customerAddresses[0]?.id ?? '')}
                onChange={(/** @type {any} */ e) => {
                  const value = e?.currentTarget?.value != null ? String(e.currentTarget.value) : '';
                  setEditingShippingAddress((prev) => ({ ...prev, [subscription.id]: value }));
                }}
              >
                {(customerAddresses || []).length === 0 ? (
                  <s-option value="">No saved addresses</s-option>
                ) : (
                  (customerAddresses || []).map((addr) => (
                    <s-option key={addr.id} value={addr.id}>
                      {formatAddressLabel(addr)}
                    </s-option>
                  ))
                )}
              </s-select>

              <s-select
                label="Billing address"
                value={editingBillingAddress[subscription.id] ?? subscription.billing_address?.id ?? (customerAddresses[0]?.id ?? '')}
                onChange={(/** @type {any} */ e) => {
                  const value = e?.currentTarget?.value != null ? String(e.currentTarget.value) : '';
                  setEditingBillingAddress((prev) => ({ ...prev, [subscription.id]: value }));
                }}
              >
                {(customerAddresses || []).length === 0 ? (
                  <s-option value="">No saved addresses</s-option>
                ) : (
                  (customerAddresses || []).map((addr) => (
                    <s-option key={addr.id} value={addr.id}>
                      {formatAddressLabel(addr)}
                    </s-option>
                  ))
                )}
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
        </>
      )}
    </s-stack>
  );
}
