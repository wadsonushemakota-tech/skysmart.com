import React, { useState } from 'react';

const CartDrawer = ({
  open,
  onClose,
  cart,
  updateQuantity,
  removeFromCart,
  onPay,
  loading,
  errorMessage,
  onClearError,
}) => {
  const [email, setEmail] = useState('');
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

  if (!open) return null;

  return (
    <div className="cart-drawer-root" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <button type="button" className="cart-drawer-backdrop" onClick={onClose} aria-label="Close bag" />
      <div className="cart-drawer-panel">
        <div className="cart-drawer-header">
          <h2>Bag ({cart.reduce((n, i) => n + i.quantity, 0)})</h2>
          <button type="button" className="cart-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {cart.length === 0 ? (
          <p className="cart-drawer-empty">Your bag is empty. Add something you love!</p>
        ) : (
          <ul className="cart-drawer-list">
            {cart.map((item) => (
              <li key={item.id} className="cart-drawer-item">
                <img src={item.image.startsWith('/') ? item.image : `/${item.image}`} alt="" className="cart-drawer-thumb" />
                <div className="cart-drawer-item-body">
                  <div className="cart-drawer-item-title">{item.name}</div>
                  <div className="cart-drawer-item-price">${Number(item.price).toFixed(2)}</div>
                  <div className="cart-drawer-qty">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="cart-drawer-remove"
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {cart.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-drawer-row cart-drawer-subtotal">
              <span>Subtotal</span>
              <strong>${subtotal.toFixed(2)}</strong>
            </div>
            <p className="cart-drawer-hint">Shipping and taxes are calculated at secure checkout.</p>

            <label className="cart-drawer-email-label" htmlFor="checkout-email">
              Email for receipt
            </label>
            <input
              id="checkout-email"
              type="email"
              className="cart-drawer-email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (onClearError) onClearError();
              }}
              autoComplete="email"
              inputMode="email"
            />

            {errorMessage && <p className="cart-drawer-error">{errorMessage}</p>}

            <button
              type="button"
              className="cart-drawer-checkout-btn"
              disabled={loading}
              onClick={() => onPay(email)}
            >
              {loading ? 'Redirecting…' : 'Secure checkout'}
            </button>
            <p className="cart-drawer-stripe-note">You will complete payment on our secure provider (cards and more).</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;
