import { RestApi } from '@magento/peregrine';

import { dispatch, getState } from 'src/store';
import checkoutActions from 'src/actions/checkout';
import {
    mockGetItem,
    mockSetItem,
    mockRemoveItem
} from 'src/util/simplePersistence';
import actions from '../actions';
import {
    addItemToCart,
    createGuestCart,
    getCartDetails,
    toggleCart
} from '../asyncActions';

jest.mock('src/store');
jest.mock('src/util/simplePersistence');

const thunkArgs = [dispatch, getState];
const { request } = RestApi.Magento2;

beforeAll(() => {
    getState.mockImplementation(() => ({
        app: { drawer: null },
        cart: { guestCartId: 'GUEST_CART_ID' }
    }));
});

afterEach(() => {
    dispatch.mockClear();
    request.mockClear();
    getState.mockClear();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
    mockRemoveItem.mockClear();
});

afterAll(() => {
    getState.mockRestore();
});

test('createGuestCart() returns a thunk', () => {
    expect(createGuestCart()).toBeInstanceOf(Function);
});

test('createGuestCart thunk returns undefined', async () => {
    const result = await createGuestCart()(...thunkArgs);

    expect(result).toBeUndefined();
});

test('createGuestCart thunk does nothing if a guest cart exists in state', async () => {
    await createGuestCart()(...thunkArgs);

    expect(dispatch).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
});

test('createGuestCart thunk uses the guest cart from storage', async () => {
    const storedGuestCartId = 'STORED_GUEST_CART_ID';
    getState.mockImplementationOnce(() => ({ cart: {} }));
    mockGetItem.mockImplementationOnce(() => storedGuestCartId);

    await createGuestCart()(...thunkArgs);

    expect(mockGetItem).toHaveBeenCalledWith('guestCartId');
    expect(dispatch).toHaveBeenNthCalledWith(1, checkoutActions.reset());
    expect(dispatch).toHaveBeenNthCalledWith(
        2,
        actions.getGuestCart.receive(storedGuestCartId)
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
});

test('createGuestCart thunk dispatches actions on success', async () => {
    const response = 'NEW_GUEST_CART_ID';

    request.mockResolvedValueOnce(response);
    getState.mockImplementationOnce(() => ({ cart: {} }));

    await createGuestCart()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(1, checkoutActions.reset());
    expect(dispatch).toHaveBeenNthCalledWith(2, actions.getGuestCart.request());
    expect(dispatch).toHaveBeenNthCalledWith(
        3,
        actions.getGuestCart.receive(response)
    );
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(mockSetItem).toHaveBeenCalled();
});

test('createGuestCart thunk dispatches actions on failure', async () => {
    const error = new Error('ERROR');

    request.mockRejectedValueOnce(error);
    getState.mockImplementationOnce(() => ({ cart: {} }));
    mockGetItem.mockImplementationOnce(() => {});

    await createGuestCart()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(1, checkoutActions.reset());
    expect(dispatch).toHaveBeenNthCalledWith(2, actions.getGuestCart.request());
    expect(dispatch).toHaveBeenNthCalledWith(
        3,
        actions.getGuestCart.receive(error)
    );
    expect(dispatch).toHaveBeenCalledTimes(3);
});

test('addItemToCart() returns a thunk', () => {
    expect(addItemToCart()).toBeInstanceOf(Function);
});

test('addItemToCart thunk returns undefined', async () => {
    const result = await addItemToCart()(...thunkArgs);

    expect(result).toBeUndefined();
});

test('addItemToCart thunk dispatches actions on success', async () => {
    const payload = { item: 'ITEM', quantity: 1 };
    const cartItem = 'CART_ITEM';

    request.mockResolvedValueOnce(cartItem);
    await addItemToCart(payload)(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(
        1,
        actions.addItem.request(payload)
    );
    expect(dispatch).toHaveBeenNthCalledWith(
        2,
        actions.addItem.receive({ cartItem, ...payload })
    );
    expect(dispatch).toHaveBeenNthCalledWith(3, expect.any(Function));
    expect(dispatch).toHaveBeenNthCalledWith(4, expect.any(Function));
    expect(dispatch).toHaveBeenCalledTimes(4);
});

test('addItemToCart thunk skips image cache if no sku or image', async () => {
    const noSku = {
        quantity: 1,
        item: {
            media_gallery_entries: [
                {
                    position: 1,
                    url: 'http://example.com'
                }
            ]
        }
    };
    await addItemToCart(noSku)(...thunkArgs);
    expect(mockGetItem).not.toHaveBeenCalled;
    const noImages = {
        quantity: 1,
        item: {
            sku: 'INVISIBLE'
        }
    };
    await addItemToCart(noImages)(...thunkArgs);
    expect(mockGetItem).not.toHaveBeenCalled;
    const emptyImages = {
        quantity: 1,
        item: {
            sku: 'INVISIBLE',
            media_gallery_entries: []
        }
    };
    await addItemToCart(emptyImages)(...thunkArgs);
    expect(mockGetItem).not.toHaveBeenCalled;
});

test('addItemToCart stores product images in local cache for use in cart', async () => {
    const itemWithImages = {
        quantity: 1,
        item: {
            sku: 'HELLO',
            media_gallery_entries: [
                {
                    position: 2,
                    url: 'http://example.com/second'
                },
                {
                    position: 1,
                    url: 'http://example.com/first'
                }
            ]
        }
    };
    await addItemToCart(itemWithImages)(...thunkArgs);
    expect(mockGetItem).toHaveBeenCalledWith('imagesBySku');
    expect(mockSetItem).toHaveBeenCalledWith(
        'imagesBySku',
        expect.objectContaining({
            HELLO: { position: 1, url: 'http://example.com/first' }
        })
    );

    const itemWithUnpositionedImages = {
        quantity: 1,
        item: {
            sku: 'GOODBYE',
            media_gallery_entries: [
                {
                    url: 'http://example.com'
                }
            ]
        }
    };
    await addItemToCart(itemWithUnpositionedImages)(...thunkArgs);
    expect(mockGetItem).toHaveBeenCalledTimes(2);
    expect(mockSetItem).toHaveBeenCalledWith(
        'imagesBySku',
        expect.objectContaining({
            GOODBYE: { url: 'http://example.com' }
        })
    );
});

test('addItemToCart reuses product images from cache', async () => {
    const sameItem = {
        sku: 'SAME_ITEM',
        media_gallery_entries: [{ url: 'http://example.com/same/item' }]
    };
    const fakeImageCache = {};
    mockGetItem.mockReturnValueOnce(fakeImageCache);
    await addItemToCart({ quantity: 1, item: sameItem })(...thunkArgs);
    mockGetItem.mockReturnValueOnce(fakeImageCache);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    await addItemToCart({ quantity: 4, item: sameItem })(...thunkArgs);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
});

test('addItemToCart thunk dispatches special failure if guestCartId is not present', async () => {
    const payload = { item: 'ITEM', quantity: 1 };
    const error = new Error('Missing required information: guestCartId');
    error.noGuestCartId = true;
    getState.mockImplementationOnce(() => ({ cart: {} }));
    await addItemToCart(payload)(...thunkArgs);
    expect(mockRemoveItem).toHaveBeenCalledWith('guestCartId');
    expect(dispatch).toHaveBeenNthCalledWith(
        1,
        actions.addItem.request(payload)
    );
    expect(dispatch).toHaveBeenNthCalledWith(2, actions.addItem.receive(error));
    // and now, the the createGuestCart thunk
    expect(dispatch).toHaveBeenNthCalledWith(3, expect.any(Function));
});

test('addItemToCart tries to recreate a guest cart on 404 failure', async () => {
    getState
        .mockImplementationOnce(() => ({
            cart: { guestCartId: 'OLD_AND_BUSTED' }
        }))
        .mockImplementationOnce(() => ({
            cart: { guestCartId: 'CACHED_CART' }
        }))
        .mockImplementationOnce(() => ({ cart: {} }));
    const payload = { item: 'ITEM', quantity: 1 };
    const error = new Error('ERROR');
    error.response = {
        status: 404
    };
    // image cache
    mockGetItem.mockResolvedValueOnce('CACHED_CART');

    request.mockRejectedValueOnce(error);

    await addItemToCart(payload)(...thunkArgs);

    expect(dispatch.mock.calls).toMatchInlineSnapshot(`
Array [
  Array [
    Object {
      "payload": Object {
        "item": "ITEM",
        "quantity": 1,
      },
      "type": "CART/ADD_ITEM/REQUEST",
    },
  ],
  Array [
    Object {
      "error": true,
      "payload": [Error: ERROR],
      "type": "CART/ADD_ITEM/RECEIVE",
    },
  ],
  Array [
    [Function],
  ],
  Array [
    Object {
      "payload": Object {
        "item": "ITEM",
        "quantity": 1,
      },
      "type": "CART/ADD_ITEM/REQUEST",
    },
  ],
  Array [
    Object {
      "payload": Object {
        "cartItem": undefined,
        "item": "ITEM",
        "quantity": 1,
      },
      "type": "CART/ADD_ITEM/RECEIVE",
    },
  ],
  Array [
    [Function],
  ],
  Array [
    [Function],
  ],
]
`);
});

test('addItemToCart opens drawer and gets cart details on success', async () => {
    const payload = { item: 'ITEM', quantity: 1 };
    const fakeCart = { cart: { guestCartId: 'NEW_GUEST_CART_ID' } };
    const cartItem = 'CART_ITEM';

    getState.mockReturnValueOnce(fakeCart).mockReturnValueOnce(fakeCart);
    const fakeDispatch = fn =>
        typeof fn === 'function' && fn(dispatch, getState);
    dispatch
        .mockImplementationOnce(fakeDispatch)
        .mockImplementationOnce(fakeDispatch)
        .mockImplementationOnce(fakeDispatch)
        .mockImplementationOnce(fakeDispatch)
        .mockImplementationOnce(fakeDispatch);

    request.mockResolvedValueOnce(cartItem).mockResolvedValueOnce(cartItem);
    await addItemToCart(payload)(...thunkArgs);

    expect(getState).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(7);
    expect(request).toHaveBeenCalledTimes(3);

    expect(dispatch.mock.calls).toMatchInlineSnapshot(`
Array [
  Array [
    Object {
      "payload": Object {
        "item": "ITEM",
        "quantity": 1,
      },
      "type": "CART/ADD_ITEM/REQUEST",
    },
  ],
  Array [
    Object {
      "payload": Object {
        "cartItem": "CART_ITEM",
        "item": "ITEM",
        "quantity": 1,
      },
      "type": "CART/ADD_ITEM/RECEIVE",
    },
  ],
  Array [
    [Function],
  ],
  Array [
    Object {
      "payload": "cart",
      "type": "APP/TOGGLE_DRAWER",
    },
  ],
  Array [
    [Function],
  ],
  Array [
    Object {
      "payload": "NEW_GUEST_CART_ID",
      "type": "CART/GET_DETAILS/REQUEST",
    },
  ],
  Array [
    Object {
      "payload": Object {
        "details": "CART_ITEM",
        "totals": undefined,
      },
      "type": "CART/GET_DETAILS/RECEIVE",
    },
  ],
]
`);
});

test('getCartDetails() returns a thunk', () => {
    expect(getCartDetails()).toBeInstanceOf(Function);
});

test('getCartDetails thunk returns undefined', async () => {
    const result = await getCartDetails()(...thunkArgs);

    expect(result).toBeUndefined();
});

test('getCartDetails thunk creates a guest cart if no ID is found', async () => {
    getState
        // for the getCartDetails state check
        .mockImplementationOnce(() => ({ cart: {} }))
        // for the createGuestCart check
        .mockImplementationOnce(() => ({ cart: {} }))
        // for the subsequent getCartDetails re-check
        .mockImplementationOnce(() => ({
            cart: { guestCartId: 'NEW_GUEST_CART_ID' }
        }));
    dispatch
        // for not dispatching the sync notifier action
        .mockImplementationOnce(() => {})
        // for actually dispatching the createGuestCart action
        .mockImplementationOnce(fn => fn(...thunkArgs));
    mockGetItem.mockImplementationOnce(() => {});
    request
        // for createGuestCart
        .mockResolvedValueOnce('NEW_GUEST_CART_ID')
        // for getCartDetails
        .mockResolvedValueOnce({
            id: 1,
            guestCartId: 'NEW_GUEST_CART_ID',
            items: []
        });

    await getCartDetails()(...thunkArgs);

    expect(getState).toHaveBeenCalledTimes(3);
    expect(mockGetItem).toHaveBeenCalled();
    const createCallArgs = request.mock.calls[0];
    const retrieveCallArgs = request.mock.calls[1];
    expect(createCallArgs[0]).toBe('/rest/V1/guest-carts');
    expect(createCallArgs[1]).toHaveProperty('method', 'POST');
    expect(retrieveCallArgs[0]).toBe('/rest/V1/guest-carts/NEW_GUEST_CART_ID/');
});

test('getCartDetails thunk deletes an old cart id and recreates a guest cart if cart ID is expired', async () => {
    let tempStorage = {};
    mockSetItem.mockImplementation((key, value) => {
        tempStorage[key] = value;
    });
    mockGetItem.mockImplementation(key => {
        return tempStorage[key];
    });
    getState
        // for the getCartDetails state check
        .mockImplementationOnce(() => ({
            cart: { guestCartId: 'EXPIRED_CART_ID' }
        }))
        // for the createGuestCart check
        .mockImplementationOnce(() => ({
            cart: { guestCartId: tempStorage.guestCartId }
        }))
        // for the subsequent getCartDetails re-check
        .mockImplementationOnce(() => ({
            cart: { guestCartId: 'BRAND_NEW_CART' }
        }));
    dispatch
        // for not dispatching the sync notifier action
        .mockImplementationOnce(() => {})
        // for not dispatching the create notifier action
        .mockImplementationOnce(() => {})
        // for actually dispatching the createGuestCart action
        .mockImplementationOnce(fn => fn(...thunkArgs));
    // mockGetItem.mockImplementationOnce(() => 'EXPIRED_CART_ID');
    request
        // for for getting expired cart
        .mockRejectedValueOnce({ response: { status: 404 } })
        // for for getting expired cart totals
        .mockRejectedValueOnce({ response: { status: 404 } })
        // for createNewCart
        .mockResolvedValueOnce('BRAND_NEW_CART')
        // for getCartDetails
        .mockResolvedValueOnce({
            id: 1,
            guestCartId: 'BRAND_NEW_CART',
            items: []
        });

    await getCartDetails()(...thunkArgs);

    expect(getState).toHaveBeenCalledTimes(3);
    expect(mockGetItem).toHaveBeenCalledWith('guestCartId');
    expect(mockRemoveItem).toHaveBeenCalledWith('guestCartId');
    expect(mockSetItem).toHaveBeenCalledWith('guestCartId', 'BRAND_NEW_CART');
    const [
        retrieveExpiredCallArgs,
        retrieveExpiredTotalsArgs,
        createCallArgs,
        retrieveCallArgs
    ] = request.mock.calls;
    expect(retrieveExpiredCallArgs[0]).toBe(
        '/rest/V1/guest-carts/EXPIRED_CART_ID/'
    );
    expect(retrieveExpiredTotalsArgs[0]).toBe(
        '/rest/V1/guest-carts/EXPIRED_CART_ID/totals'
    );
    expect(createCallArgs[0]).toBe('/rest/V1/guest-carts');
    expect(createCallArgs[1]).toHaveProperty('method', 'POST');
    expect(retrieveCallArgs[0]).toBe('/rest/V1/guest-carts/BRAND_NEW_CART/');
});

test('getCartDetails thunk dispatches actions on success', async () => {
    request.mockResolvedValueOnce(1);
    request.mockResolvedValueOnce(2);

    await getCartDetails()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(
        1,
        actions.getDetails.request('GUEST_CART_ID')
    );
    expect(dispatch).toHaveBeenNthCalledWith(
        2,
        actions.getDetails.receive({ details: 1, totals: 2 })
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
});

test('getCartDetails thunk dispatches actions on failure', async () => {
    const error = new Error('ERROR');
    request.mockRejectedValueOnce(error);

    await getCartDetails()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(
        1,
        actions.getDetails.request('GUEST_CART_ID')
    );
    expect(dispatch).toHaveBeenNthCalledWith(
        2,
        actions.getDetails.receive(error)
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
});

test('getCartDetails thunk merges cached item images into details', async () => {
    const cache = { SKU_1: 'IMAGE_1' };
    const items = [
        { image: 'IMAGE_0', sku: 'SKU_0' },
        { sku: 'SKU_1' },
        { sku: 'SKU_2' }
    ];
    const expected = [
        items[0],
        { ...items[1], image: cache.SKU_1 },
        { ...items[2], image: {} }
    ];

    mockGetItem.mockResolvedValueOnce(cache);
    request.mockResolvedValueOnce({ items });
    request.mockResolvedValueOnce(2);

    await getCartDetails()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(
        2,
        actions.getDetails.receive({ details: { items: expected }, totals: 2 })
    );
});

test('toggleCart() returns a thunk', () => {
    expect(toggleCart()).toBeInstanceOf(Function);
});

test('toggleCart thunk returns undefined', async () => {
    const result = await toggleCart()(...thunkArgs);

    expect(result).toBeUndefined();
});

test('toggleCart thunk exits if app state is not present', async () => {
    getState.mockImplementationOnce(() => ({ cart: {} }));

    await toggleCart()(...thunkArgs);

    expect(dispatch).not.toHaveBeenCalled();
});

test('toggleCart thunk exits if cart state is not present', async () => {
    getState.mockImplementationOnce(() => ({ app: {} }));

    await toggleCart()(...thunkArgs);

    expect(dispatch).not.toHaveBeenCalled();
});

test('toggleCart thunk opens the drawer and refreshes the cart', async () => {
    await toggleCart()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.any(Function));
    expect(dispatch).toHaveBeenCalledTimes(2);
});

test('toggleCart thunk closes the drawer', async () => {
    getState.mockReturnValueOnce({ app: { drawer: 'cart' }, cart: {} });
    await toggleCart()(...thunkArgs);

    expect(dispatch).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(dispatch).toHaveBeenCalledTimes(1);
});
